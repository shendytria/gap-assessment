package store

import (
	"context"
	"fmt"
	"net/http"
	"strings"
	"time"

	"gapapp/internal/httpx"

	"github.com/jackc/pgx/v5"
)

type EvidenceItem struct {
	EvidenceID     int64     `json:"evidenceId"`
	ActionPlanID   int64     `json:"actionPlanId"`
	EvidenceType   string    `json:"evidenceType"` // "FILE" | "TEXT"
	EvidenceText   string    `json:"evidenceText"`
	FileName       string    `json:"fileName"`
	FilePath       string    `json:"-"`
	MimeType       string    `json:"mimeType"`
	FileSize       *int64    `json:"fileSize"`
	UploadedByName string    `json:"uploadedByName"`
	UploadedAt     time.Time `json:"uploadedAt"`
}

type DueChangeItem struct {
	DueChangeID       int64      `json:"dueChangeId"`
	ActionPlanID      int64      `json:"actionPlanId"`
	OldDueDate        time.Time  `json:"oldDueDate"`
	NewDueDate        time.Time  `json:"newDueDate"`
	Reason            string     `json:"reason"`
	Status            string     `json:"status"` // "REQUESTED" | "APPROVED" | "REJECTED"
	RequestedByName   string     `json:"requestedByName"`
	RequestedAt       time.Time  `json:"requestedAt"`
	VerifiedByName    string     `json:"verifiedByName"`
	VerifiedAt        *time.Time `json:"verifiedAt"`
	VerificationNotes string     `json:"verificationNotes"`
}

type ActionPlanItem struct {
	ActionPlanID        int64           `json:"actionPlanId"`
	GapAnalysisID       int64           `json:"gapAnalysisId"`
	GapID               int             `json:"gapId"`
	GapNo               string          `json:"gapNo"`
	LegalNumber         string          `json:"legalNumber"`
	RegulationTitle     string          `json:"regulationTitle"`
	SiteID              int             `json:"siteId"`
	SiteCode            string          `json:"siteCode"`
	WorkflowStatus      string          `json:"workflowStatus"`
	ExecutionStatus     string          `json:"executionStatus"` // "IN_PROGRESS" | "PENDING_VERIFICATION" | "VERIFIED"
	ClauseNo            string          `json:"clauseNo"`
	RequirementText     string          `json:"requirementText"`
	ActualCondition     string          `json:"actualCondition"`
	ClauseStatus        string          `json:"clauseStatus"` // "100" | "50" | "0" | "NA"
	PlanText            string          `json:"planText"`
	PICUserID           *int            `json:"picUserId"`
	PICName             string          `json:"picName"`
	PICInitials         string          `json:"picInitials"`
	DeptCode            string          `json:"deptCode"`
	DeptCodes           []string        `json:"deptCodes"`
	DeptInControlAll    bool            `json:"deptInControlAll"`
	CreateDate          time.Time       `json:"createDate"`
	DueDate             *time.Time      `json:"dueDate"`
	ProgressPct         int             `json:"progressPct"`
	ProgressNotes       string          `json:"progressNotes"`
	CloseDate           *time.Time      `json:"closeDate"`
	LeadTimeDays        *int            `json:"leadTimeDays"`
	OverdueDays         int             `json:"overdueDays"`
	MonitoringStatus    string          `json:"monitoringStatus"` // 'Pending', 'On time', 'Overdue'
	VerifiedByName      string          `json:"verifiedByName"`
	VerifiedAt          *time.Time      `json:"verifiedAt"`
	FulfillmentNotes    string          `json:"fulfillmentNotes"`
	Notes               string          `json:"notes"`
	EvidenceCount       int             `json:"evidenceCount"`
	EvidenceFiles       []string        `json:"evidenceFiles"`
	Evidences           []EvidenceItem  `json:"evidences"`
	PendingDueChange    *DueChangeItem  `json:"pendingDueChange"`
	DueChanges          []DueChangeItem `json:"dueChanges"`
	CanUpdate           bool            `json:"canUpdate"`
	CanRequestDueChange bool            `json:"canRequestDueChange"`
	CanVerify           bool            `json:"canVerify"`
}

func computeMonitoringMetrics(item *ActionPlanItem, today time.Time) {
	if item.CloseDate != nil {
		lt := int(item.CloseDate.Sub(item.CreateDate).Hours() / 24)
		if lt < 0 {
			lt = 0
		}
		item.LeadTimeDays = &lt
		if item.DueDate == nil || !item.CloseDate.After(*item.DueDate) {
			item.MonitoringStatus = "On time"
		} else {
			item.MonitoringStatus = "Overdue"
		}
		return
	}
	if item.DueDate != nil && today.After(*item.DueDate) {
		item.OverdueDays = int(today.Sub(*item.DueDate).Hours() / 24)
		item.MonitoringStatus = "Overdue"
		return
	}
	item.MonitoringStatus = "Pending"
}

func (s *Store) queryActionPlans(ctx context.Context, actor *User, whereClause string, orderBy string, args ...any) ([]ActionPlanItem, error) {
	query := fmt.Sprintf(`
		SELECT ap.action_plan_id, ap.gap_analysis_id, g.gap_id, g.gap_no,
		       r.legal_number, r.title, g.site_id, s.site_code,
		       g.workflow_status::text, COALESCE(ap.execution_status, 'IN_PROGRESS'),
		       rc.clause_no, rc.requirement_text, COALESCE(ga.actual_condition,''),
		       COALESCE(ga.status::text, ga.proposed_status::text, ''),
		       COALESCE(ap.plan_text,''), ap.pic_user_id, COALESCE(u_pic.full_name,''), COALESCE(ap.pic_initials,''),
		       COALESCE(d.department_code,''), ga.dept_in_control_all,
		       ap.create_date, ap.due_date, ap.progress_pct, COALESCE(ap.progress_notes,''),
		       ap.close_date,
		       COALESCE(u_v.full_name,''), ap.verified_at, COALESCE(ap.fulfillment_notes,''),
		       (g.stage1_approved_at IS NOT NULL) AS stage1_approved,
		       COALESCE(ga.dept_in_control_id = $1::int
		         OR EXISTS (SELECT 1 FROM gap_analysis_dept gd WHERE gd.gap_analysis_id = ga.gap_analysis_id AND gd.department_id = $1::int)
		         OR ga.dept_in_control_all = TRUE, FALSE) AS matches_actor_dept
		FROM action_plan ap
		JOIN gap_analysis ga ON ga.gap_analysis_id = ap.gap_analysis_id
		JOIN gap_document g ON g.gap_id = ga.gap_id
		JOIN regulation r ON r.regulation_id = g.regulation_id
		JOIN regulation_clause rc ON rc.clause_id = ga.clause_id
		JOIN site s ON s.site_id = g.site_id
		LEFT JOIN users u_pic ON u_pic.user_id = ap.pic_user_id
		LEFT JOIN department d ON d.department_id = ga.dept_in_control_id
		LEFT JOIN users u_v ON u_v.user_id = ap.verified_by
		%s
		ORDER BY %s`, whereClause, orderBy)

	var actorDeptID *int
	if actor != nil {
		actorDeptID = actor.DepartmentID
	}
	allArgs := append([]any{actorDeptID}, args...)
	rows, err := s.Pool.Query(ctx, query, allArgs...)
	if err != nil {
		return []ActionPlanItem{}, err
	}
	defer rows.Close()

	now := time.Now()
	today := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, time.UTC)

	out := []ActionPlanItem{}
	planIdx := map[int64]int{}
	planIDs := []int64{}

	for rows.Next() {
		var item ActionPlanItem
		var stage1Approved, matchesActorDept bool
		if err := rows.Scan(
			&item.ActionPlanID, &item.GapAnalysisID, &item.GapID, &item.GapNo,
			&item.LegalNumber, &item.RegulationTitle, &item.SiteID, &item.SiteCode,
			&item.WorkflowStatus, &item.ExecutionStatus,
			&item.ClauseNo, &item.RequirementText, &item.ActualCondition,
			&item.ClauseStatus,
			&item.PlanText, &item.PICUserID, &item.PICName, &item.PICInitials,
			&item.DeptCode, &item.DeptInControlAll,
			&item.CreateDate, &item.DueDate, &item.ProgressPct, &item.ProgressNotes,
			&item.CloseDate,
			&item.VerifiedByName, &item.VerifiedAt, &item.FulfillmentNotes,
			&stage1Approved, &matchesActorDept,
		); err != nil {
			return nil, err
		}

		// Unified notes fallback for existing records
		if strings.TrimSpace(item.FulfillmentNotes) != "" {
			item.Notes = item.FulfillmentNotes
		} else {
			item.Notes = item.ProgressNotes
		}
		item.DeptCodes = []string{}
		item.Evidences = []EvidenceItem{}
		item.EvidenceFiles = []string{}
		item.DueChanges = []DueChangeItem{}

		computeMonitoringMetrics(&item, today)

		if actor != nil {
			isSameSite := actor.SiteID != nil && *actor.SiteID == item.SiteID
			if actor.RoleCode == "PIC_AREA" && stage1Approved && item.WorkflowStatus == "EXECUTION" && isSameSite && matchesActorDept {
				if item.ExecutionStatus == "IN_PROGRESS" {
					item.CanUpdate = true
				}
				if item.ExecutionStatus != "VERIFIED" {
					item.CanRequestDueChange = true
				}
			}
			if actor.RoleCode == "CO_GAP_SUPERVISOR" && stage1Approved && item.WorkflowStatus == "EXECUTION" && item.ExecutionStatus == "PENDING_VERIFICATION" {
				item.CanVerify = true
			}
		}

		planIdx[item.ActionPlanID] = len(out)
		planIDs = append(planIDs, item.ActionPlanID)
		out = append(out, item)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	if len(out) == 0 {
		return out, nil
	}

	// Hydrate DeptCodes from gap_analysis_dept
	gaIDs := make([]int64, 0, len(out))
	gaToPlanIdxs := map[int64][]int{}
	for i, it := range out {
		gaIDs = append(gaIDs, it.GapAnalysisID)
		gaToPlanIdxs[it.GapAnalysisID] = append(gaToPlanIdxs[it.GapAnalysisID], i)
	}
	deptRows, err := s.Pool.Query(ctx, `
		SELECT gd.gap_analysis_id, d.department_code
		FROM gap_analysis_dept gd
		JOIN department d ON d.department_id = gd.department_id
		WHERE gd.gap_analysis_id = ANY($1)
		ORDER BY d.department_code`, gaIDs)
	if err == nil {
		for deptRows.Next() {
			var gaID int64
			var code string
			if deptRows.Scan(&gaID, &code) == nil {
				for _, idx := range gaToPlanIdxs[gaID] {
					out[idx].DeptCodes = append(out[idx].DeptCodes, code)
				}
			}
		}
		deptRows.Close()
	}
	for i := range out {
		if out[i].DeptInControlAll {
			out[i].DeptCode = "All dept"
		} else if len(out[i].DeptCodes) > 0 {
			out[i].DeptCode = strings.Join(out[i].DeptCodes, ", ")
		}
	}

	// Hydrate active evidences
	evRows, err := s.Pool.Query(ctx, `
		SELECT ev.evidence_id, ev.action_plan_id, COALESCE(ev.evidence_type,'FILE'),
		       COALESCE(ev.evidence_text,''), ev.file_name, COALESCE(ev.mime_type,''), ev.file_size,
		       u.full_name, ev.uploaded_at
		FROM evidence ev
		JOIN users u ON u.user_id = ev.uploaded_by
		WHERE ev.action_plan_id = ANY($1) AND ev.is_superseded = FALSE
		ORDER BY ev.uploaded_at DESC, ev.evidence_id DESC`, planIDs)
	if err == nil {
		for evRows.Next() {
			var ev EvidenceItem
			if evRows.Scan(&ev.EvidenceID, &ev.ActionPlanID, &ev.EvidenceType, &ev.EvidenceText, &ev.FileName, &ev.MimeType, &ev.FileSize, &ev.UploadedByName, &ev.UploadedAt) == nil {
				if idx, ok := planIdx[ev.ActionPlanID]; ok {
					out[idx].Evidences = append(out[idx].Evidences, ev)
					out[idx].EvidenceCount = len(out[idx].Evidences)
					if ev.EvidenceType == "TEXT" {
						out[idx].EvidenceFiles = append(out[idx].EvidenceFiles, ev.EvidenceText)
					} else {
						out[idx].EvidenceFiles = append(out[idx].EvidenceFiles, ev.FileName)
					}
				}
			}
		}
		evRows.Close()
	}

	// Hydrate due-date change requests
	dcRows, err := s.Pool.Query(ctx, `
		SELECT dc.due_change_id, dc.action_plan_id, dc.old_due_date, dc.new_due_date, dc.reason,
		       dc.status::text, u_req.full_name, dc.requested_at,
		       COALESCE(u_ver.full_name,''), dc.verified_at, COALESCE(dc.verification_notes,'')
		FROM action_plan_due_change dc
		JOIN users u_req ON u_req.user_id = dc.requested_by
		LEFT JOIN users u_ver ON u_ver.user_id = dc.verified_by
		WHERE dc.action_plan_id = ANY($1)
		ORDER BY dc.requested_at DESC, dc.due_change_id DESC`, planIDs)
	if err == nil {
		for dcRows.Next() {
			var dc DueChangeItem
			if dcRows.Scan(&dc.DueChangeID, &dc.ActionPlanID, &dc.OldDueDate, &dc.NewDueDate, &dc.Reason,
				&dc.Status, &dc.RequestedByName, &dc.RequestedAt,
				&dc.VerifiedByName, &dc.VerifiedAt, &dc.VerificationNotes) == nil {
				if idx, ok := planIdx[dc.ActionPlanID]; ok {
					out[idx].DueChanges = append(out[idx].DueChanges, dc)
					if dc.Status == "REQUESTED" && out[idx].PendingDueChange == nil {
						dcCopy := dc
						out[idx].PendingDueChange = &dcCopy
						out[idx].CanRequestDueChange = false
					}
				}
			}
		}
		dcRows.Close()
	}

	return out, nil
}

func (s *Store) ListOutstandingActionPlans(ctx context.Context, actor *User, picUserID *int, deptID *int, siteID *int) ([]ActionPlanItem, error) {
	where := `
		WHERE ($2::int IS NULL OR ap.pic_user_id = $2::int)
		  AND ($3::int IS NULL OR ga.dept_in_control_id = $3::int
		       OR EXISTS (SELECT 1 FROM gap_analysis_dept gd WHERE gd.gap_analysis_id = ga.gap_analysis_id AND gd.department_id = $3::int)
		       OR ga.dept_in_control_all = TRUE)
		  AND ($4::smallint IS NULL OR g.site_id = $4::smallint)
		  AND ap.pic_user_id IS NOT NULL
		  AND ap.due_date IS NOT NULL
		  AND g.stage1_approved_at IS NOT NULL
		  AND g.workflow_status IN ('EXECUTION', 'APPROVAL_STAGE2')`
	return s.queryActionPlans(ctx, actor, where, "ap.due_date ASC, ap.action_plan_id ASC", picUserID, deptID, siteID)
}

func (s *Store) ListActionPlansByGapID(ctx context.Context, gapID int) ([]ActionPlanItem, error) {
	where := `WHERE g.gap_id = $2`
	return s.queryActionPlans(ctx, nil, where, "rc.sort_order ASC", gapID)
}

type UploadedEvidenceFile struct {
	FileName   string
	FilePath   string
	MimeType   string
	FileSize   int64
	FileSha256 string
}

type UpdateActionPlanReq struct {
	ProgressStatus string                `json:"progressStatus"` // "IN_PROGRESS" | "COMPLETED"
	Notes          string                `json:"notes"`
	EvidenceText   string                `json:"evidenceText"`
	UploadedFile   *UploadedEvidenceFile `json:"-"`
}

func verifyPICPlanAccessTx(ctx context.Context, tx pgx.Tx, actor *User, planID int64) (gapID int, gapNo string, siteID int, createDate time.Time, wfStatus string, stage1Approved bool, execStatus string, dueDate *time.Time, err error) {
	if actor == nil || actor.RoleCode != "PIC_AREA" {
		err = httpx.NewError(http.StatusForbidden, "FORBIDDEN", "Hanya PIC Area yang dapat mengubah progres Action Plan.")
		return
	}
	var gapAnalysisID int64
	err = tx.QueryRow(ctx, `
		SELECT ap.gap_analysis_id, ga.gap_id, g.gap_no, g.site_id, ap.create_date,
		       g.workflow_status::text, (g.stage1_approved_at IS NOT NULL), COALESCE(ap.execution_status, 'IN_PROGRESS'),
		       ap.due_date
		FROM action_plan ap
		JOIN gap_analysis ga ON ga.gap_analysis_id = ap.gap_analysis_id
		JOIN gap_document g ON g.gap_id = ga.gap_id
		WHERE ap.action_plan_id = $1
		FOR UPDATE OF ap`, planID).Scan(
		&gapAnalysisID, &gapID, &gapNo, &siteID, &createDate, &wfStatus, &stage1Approved, &execStatus, &dueDate)
	if err != nil {
		if err == pgx.ErrNoRows {
			err = httpx.NewError(http.StatusNotFound, "NOT_FOUND", "Action plan tidak ditemukan.")
		}
		return
	}

	if wfStatus != "EXECUTION" || !stage1Approved {
		err = httpx.NewError(http.StatusConflict, "WORKFLOW_LOCKED",
			"Action plan hanya dapat diupdate jika dokumen sudah Approved Stage 1 (tahap Execution).")
		return
	}

	if actor.SiteID == nil || *actor.SiteID != siteID || actor.DepartmentID == nil {
		err = httpx.NewError(http.StatusForbidden, "FORBIDDEN",
			"PIC hanya dapat mengupdate klausul departemen dan site-nya sendiri.")
		return
	}

	var deptMatch bool
	err = tx.QueryRow(ctx, `
		SELECT (
			ga.dept_in_control_id = $2
			OR ga.dept_in_control_all = TRUE
			OR EXISTS (SELECT 1 FROM gap_analysis_dept gd WHERE gd.gap_analysis_id = ga.gap_analysis_id AND gd.department_id = $2)
		)
		FROM gap_analysis ga
		WHERE ga.gap_analysis_id = $1`, gapAnalysisID, *actor.DepartmentID).Scan(&deptMatch)
	if err != nil {
		return
	}
	if !deptMatch {
		err = httpx.NewError(http.StatusForbidden, "FORBIDDEN",
			"PIC hanya dapat mengupdate klausul milik departemennya sendiri.")
		return
	}
	return
}

func (s *Store) UpdateActionPlan(ctx context.Context, actor *User, planID int64, req UpdateActionPlanReq) error {
	statusNorm := strings.TrimSpace(strings.ToUpper(req.ProgressStatus))
	switch statusNorm {
	case "IN_PROGRESS", "COMPLETED":
	case "COMPLETED_SUBMIT_FOR_VERIFICATION":
		statusNorm = "COMPLETED"
	default:
		return httpx.NewError(http.StatusBadRequest, "INVALID_STATUS",
			"Status progres wajib dipilih: 'In Progress' atau 'Completed – Submit for Verification'.")
	}

	return s.WithTx(ctx, actor.ID, func(tx pgx.Tx) error {
		gapID, gapNo, siteID, _, _, _, execStatus, _, err := verifyPICPlanAccessTx(ctx, tx, actor, planID)
		if err != nil {
			return err
		}
		if execStatus == "PENDING_VERIFICATION" || execStatus == "VERIFIED" {
			return httpx.NewError(http.StatusConflict, "WORKFLOW_LOCKED",
				"Action plan sudah disubmit untuk verifikasi Supervisor atau sudah terverifikasi.")
		}

		// Save optional text evidence
		evText := strings.TrimSpace(req.EvidenceText)
		if evText != "" {
			if _, err := tx.Exec(ctx, `
				INSERT INTO evidence (action_plan_id, evidence_type, evidence_text, file_name, file_path, uploaded_by)
				VALUES ($1, 'TEXT', $2, 'Text Evidence', '', $3)`,
				planID, evText, actor.ID); err != nil {
				return err
			}
		}

		// Save optional uploaded file evidence
		if req.UploadedFile != nil {
			if _, err := tx.Exec(ctx, `
				INSERT INTO evidence (action_plan_id, evidence_type, file_name, file_path, mime_type, file_size, file_sha256, uploaded_by)
				VALUES ($1, 'FILE', $2, $3, $4, $5, $6, $7)`,
				planID, req.UploadedFile.FileName, req.UploadedFile.FilePath,
				req.UploadedFile.MimeType, req.UploadedFile.FileSize, req.UploadedFile.FileSha256, actor.ID); err != nil {
				return err
			}
		}

		trimmedNotes := strings.TrimSpace(req.Notes)

		if statusNorm == "COMPLETED" {
			var evCount int
			if err := tx.QueryRow(ctx, `
				SELECT COUNT(*)::int FROM evidence
				WHERE action_plan_id = $1 AND is_superseded = FALSE`, planID).Scan(&evCount); err != nil {
				return err
			}
			if evCount == 0 {
				return httpx.NewError(http.StatusBadRequest, "EVIDENCE_REQUIRED",
					"Evidence (teks atau upload file PDF/gambar) wajib diisi saat memilih Completed – Submit for Verification.")
			}

			if _, err := tx.Exec(ctx, `
				UPDATE action_plan
				SET execution_status = 'PENDING_VERIFICATION',
				    progress_pct = 100,
				    close_date = GREATEST(create_date, CURRENT_DATE),
				    fulfillment_notes = NULLIF($2,''),
				    progress_notes = NULLIF($2,'')
				WHERE action_plan_id = $1`,
				planID, trimmedNotes); err != nil {
				return err
			}

			var clauseNo string
			_ = tx.QueryRow(ctx, `
				SELECT rc.clause_no
				FROM action_plan ap
				JOIN gap_analysis ga ON ga.gap_analysis_id = ap.gap_analysis_id
				JOIN regulation_clause rc ON rc.clause_id = ga.clause_id
				WHERE ap.action_plan_id = $1`, planID).Scan(&clauseNo)

			if err := notifySupervisorsForSiteTx(ctx, tx, siteID, "ACTION_PLAN_COMPLETED", &gapID, &planID,
				fmt.Sprintf("[%s] Action Plan Klausul %s Selesai — Perlu Verifikasi", gapNo, clauseNo),
				fmt.Sprintf("PIC %s (%s) menandai Action Plan klausul %s pada dokumen %s sebagai Completed dan menunggu verifikasi Supervisor untuk masuk ke Stage 2.",
					actor.FullName, actor.DepartmentCode, clauseNo, gapNo)); err != nil {
				return err
			}
		} else {
			if _, err := tx.Exec(ctx, `
				UPDATE action_plan
				SET execution_status = 'IN_PROGRESS',
				    progress_pct = 50,
				    close_date = NULL,
				    fulfillment_notes = NULLIF($2,''),
				    progress_notes = NULLIF($2,'')
				WHERE action_plan_id = $1`,
				planID, trimmedNotes); err != nil {
				return err
			}
		}
		return nil
	})
}

type VerifyActionPlanResult struct {
	EnteredStage2 bool   `json:"enteredStage2"`
	GapNo         string `json:"gapNo"`
}

func (s *Store) VerifyActionPlanSupervisor(ctx context.Context, actor *User, planID int64, approve bool, clauseStatus string, notes string) (*VerifyActionPlanResult, error) {
	if actor == nil || actor.RoleCode != "CO_GAP_SUPERVISOR" {
		return nil, httpx.NewError(http.StatusForbidden, "FORBIDDEN", "Hanya Co Gap Supervisor yang dapat memverifikasi penyelesaian Action Plan dan menentukan status klausul.")
	}
	trimmedNotes := strings.TrimSpace(notes)
	if !approve && trimmedNotes == "" {
		return nil, httpx.NewError(http.StatusBadRequest, "NOTES_REQUIRED", "Catatan pengembalian wajib diisi jika mengembalikan Action Plan ke PIC Area.")
	}
	if approve {
		switch clauseStatus {
		case "100", "50", "0", "NA":
		default:
			return nil, httpx.NewError(http.StatusBadRequest, "INVALID_CLAUSE_STATUS", "Supervisor wajib menentukan status klausul: 100, 50, 0, atau NA.")
		}
	}

	var res VerifyActionPlanResult
	err := s.WithTx(ctx, actor.ID, func(tx pgx.Tx) error {
		var gapAnalysisID int64
		var gapID, siteID, cycle int
		var gapNo, wfStatus, execStatus string
		var stage1Approved, reqQA bool
		var picUserID *int
		var clauseNo string

		err := tx.QueryRow(ctx, `
			SELECT ap.gap_analysis_id, ga.gap_id, g.gap_no, g.site_id, g.approval_cycle, c.requires_qa_manager,
			       g.workflow_status::text, (g.stage1_approved_at IS NOT NULL), COALESCE(ap.execution_status, 'IN_PROGRESS'),
			       ap.pic_user_id, rc.clause_no
			FROM action_plan ap
			JOIN gap_analysis ga ON ga.gap_analysis_id = ap.gap_analysis_id
			JOIN regulation_clause rc ON rc.clause_id = ga.clause_id
			JOIN gap_document g ON g.gap_id = ga.gap_id
			JOIN category c ON c.category_id = g.category_id
			WHERE ap.action_plan_id = $1
			FOR UPDATE OF ap`, planID).Scan(
			&gapAnalysisID, &gapID, &gapNo, &siteID, &cycle, &reqQA,
			&wfStatus, &stage1Approved, &execStatus, &picUserID, &clauseNo)
		if err != nil {
			if err == pgx.ErrNoRows {
				return httpx.NewError(http.StatusNotFound, "NOT_FOUND", "Action plan tidak ditemukan.")
			}
			return err
		}
		res.GapNo = gapNo

		if wfStatus != "EXECUTION" || !stage1Approved || execStatus != "PENDING_VERIFICATION" {
			return httpx.NewError(http.StatusConflict, "INVALID_STATE",
				"Action plan ini tidak berada pada status menunggu verifikasi Supervisor.")
		}

		if !approve {
			if _, err := tx.Exec(ctx, `
				UPDATE action_plan
				SET execution_status = 'IN_PROGRESS',
				    progress_pct = 50,
				    close_date = NULL,
				    verified_by = NULL,
				    verified_at = NULL
				WHERE action_plan_id = $1`, planID); err != nil {
				return err
			}
			if _, err := tx.Exec(ctx, `
				UPDATE gap_analysis
				SET verification_notes = NULLIF($2,''), verified_by = $3, verified_at = now()
				WHERE gap_analysis_id = $1`, gapAnalysisID, trimmedNotes, actor.ID); err != nil {
				return err
			}
			if picUserID != nil {
				_ = insertNotificationTx(ctx, tx, "ACTION_PLAN_RETURNED", *picUserID, &gapID, &planID,
					fmt.Sprintf("[%s] Action Plan Klausul %s Dikembalikan Supervisor", gapNo, clauseNo),
					fmt.Sprintf("Supervisor mengembalikan Action Plan klausul %s untuk diperbaiki: %s", clauseNo, trimmedNotes))
			}
			return nil
		}

		isApplicable := clauseStatus != "NA"
		if _, err := tx.Exec(ctx, `
			UPDATE gap_analysis
			SET is_applicable = $2,
			    status = $3::gap_status,
			    verified_by = $4,
			    verified_at = now(),
			    verification_notes = COALESCE(NULLIF($5,''), verification_notes)
			WHERE gap_analysis_id = $1`,
			gapAnalysisID, isApplicable, clauseStatus, actor.ID, trimmedNotes); err != nil {
			return err
		}

		if _, err := tx.Exec(ctx, `
			UPDATE action_plan
			SET execution_status = 'VERIFIED',
			    progress_pct = 100,
			    close_date = COALESCE(close_date, GREATEST(create_date, CURRENT_DATE)),
			    verified_by = $2,
			    verified_at = now()
			WHERE action_plan_id = $1`, planID, actor.ID); err != nil {
			return err
		}

		// Check if all action plans under this gap document are now verified
		var remaining int
		if err := tx.QueryRow(ctx, `
			SELECT COUNT(*)::int
			FROM action_plan ap
			JOIN gap_analysis ga ON ga.gap_analysis_id = ap.gap_analysis_id
			WHERE ga.gap_id = $1 AND COALESCE(ap.execution_status, 'IN_PROGRESS') <> 'VERIFIED'`, gapID).Scan(&remaining); err != nil {
			return err
		}

		if remaining == 0 {
			if _, err := tx.Exec(ctx, `
				UPDATE gap_document
				SET workflow_status = 'APPROVAL_STAGE2'
				WHERE gap_id = $1`, gapID); err != nil {
				return err
			}
			if err := createApprovalChainTx(ctx, tx, gapID, gapNo, "STAGE2", cycle, siteID, reqQA); err != nil {
				return err
			}
			res.EnteredStage2 = true
		}

		return nil
	})
	if err != nil {
		return nil, err
	}
	return &res, nil
}

func (s *Store) RequestDueDateChange(ctx context.Context, actor *User, planID int64, newDueDate time.Time, reason string) error {
	trimmedReason := strings.TrimSpace(reason)
	if trimmedReason == "" {
		return httpx.NewError(http.StatusBadRequest, "REASON_REQUIRED", "Alasan perubahan due date wajib diisi.")
	}

	return s.WithTx(ctx, actor.ID, func(tx pgx.Tx) error {
		gapID, gapNo, siteID, createDate, _, _, execStatus, curDueDate, err := verifyPICPlanAccessTx(ctx, tx, actor, planID)
		if err != nil {
			return err
		}
		if execStatus == "VERIFIED" {
			return httpx.NewError(http.StatusConflict, "WORKFLOW_LOCKED", "Action plan sudah diverifikasi; due date tidak dapat diubah.")
		}
		if curDueDate == nil {
			return httpx.NewError(http.StatusBadRequest, "NO_DUE_DATE", "Due date awal belum ditetapkan.")
		}
		if newDueDate.Before(createDate) {
			return httpx.NewError(http.StatusBadRequest, "INVALID_DATE", "Due date baru tidak boleh lebih awal dari tanggal pembuatan action plan.")
		}
		if newDueDate.Format("2006-01-02") == curDueDate.Format("2006-01-02") {
			return httpx.NewError(http.StatusBadRequest, "SAME_DATE", "Due date baru sama dengan due date saat ini.")
		}

		var hasPending bool
		_ = tx.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM action_plan_due_change WHERE action_plan_id = $1 AND status = 'REQUESTED')`, planID).Scan(&hasPending)
		if hasPending {
			return httpx.NewError(http.StatusConflict, "PENDING_REQUEST_EXISTS",
				"Sudah ada pengajuan perubahan due date yang menunggu verifikasi Supervisor.")
		}

		if _, err := tx.Exec(ctx, `
			INSERT INTO action_plan_due_change (action_plan_id, old_due_date, new_due_date, reason, status, requested_by)
			VALUES ($1, $2, $3, $4, 'REQUESTED', $5)`,
			planID, *curDueDate, newDueDate, trimmedReason, actor.ID); err != nil {
			return err
		}

		return notifySupervisorsForSiteTx(ctx, tx, siteID, "DUE_CHANGE_REQUESTED", &gapID, &planID,
			fmt.Sprintf("[%s] Pengajuan Perubahan Due Date", gapNo),
			fmt.Sprintf("PIC %s mengajukan perubahan due date dari %s menjadi %s dengan alasan: %s",
				actor.FullName, curDueDate.Format("2006-01-02"), newDueDate.Format("2006-01-02"), trimmedReason))
	})
}

func (s *Store) VerifyDueDateChange(ctx context.Context, actor *User, dueChangeID int64, approve bool, notes string) error {
	if actor == nil || actor.RoleCode != "CO_GAP_SUPERVISOR" {
		return httpx.NewError(http.StatusForbidden, "FORBIDDEN", "Hanya Co Gap Supervisor yang dapat memverifikasi perubahan due date.")
	}
	trimmedNotes := strings.TrimSpace(notes)
	if !approve && trimmedNotes == "" {
		return httpx.NewError(http.StatusBadRequest, "NOTES_REQUIRED", "Catatan alasan penolakan wajib diisi jika menolak perubahan due date.")
	}

	return s.WithTx(ctx, actor.ID, func(tx pgx.Tx) error {
		var planID int64
		var newDueDate time.Time
		var reqUserID, gapID int
		var gapNo string
		err := tx.QueryRow(ctx, `
			SELECT dc.action_plan_id, dc.new_due_date, dc.requested_by, ga.gap_id, g.gap_no
			FROM action_plan_due_change dc
			JOIN action_plan ap ON ap.action_plan_id = dc.action_plan_id
			JOIN gap_analysis ga ON ga.gap_analysis_id = ap.gap_analysis_id
			JOIN gap_document g ON g.gap_id = ga.gap_id
			WHERE dc.due_change_id = $1 AND dc.status = 'REQUESTED'
			FOR UPDATE OF dc`, dueChangeID).Scan(&planID, &newDueDate, &reqUserID, &gapID, &gapNo)
		if err != nil {
			if err == pgx.ErrNoRows {
				return httpx.NewError(http.StatusNotFound, "NOT_FOUND", "Pengajuan perubahan due date tidak ditemukan atau sudah diproses.")
			}
			return err
		}

		status := "REJECTED"
		if approve {
			status = "APPROVED"
			if _, err := tx.Exec(ctx, `
				UPDATE action_plan SET due_date = $2 WHERE action_plan_id = $1`, planID, newDueDate); err != nil {
				return err
			}
		}

		if _, err := tx.Exec(ctx, `
			UPDATE action_plan_due_change
			SET status = $2::due_change_status,
			    verified_by = $3,
			    verified_at = now(),
			    verification_notes = NULLIF($4,'')
			WHERE due_change_id = $1`, dueChangeID, status, actor.ID, trimmedNotes); err != nil {
			return err
		}

		decisionLabel := "Ditolak"
		if approve {
			decisionLabel = "Disetujui"
		}
		return insertNotificationTx(ctx, tx, "DUE_CHANGE_VERIFIED", reqUserID, &gapID, &planID,
			fmt.Sprintf("[%s] Perubahan Due Date %s", gapNo, decisionLabel),
			fmt.Sprintf("Pengajuan perubahan due date menjadi %s %s oleh Supervisor.%s",
				newDueDate.Format("2006-01-02"), strings.ToLower(decisionLabel),
				func() string {
					if trimmedNotes != "" {
						return " Catatan: " + trimmedNotes
					}
					return ""
				}()))
	})
}

func (s *Store) GetEvidenceFile(ctx context.Context, evidenceID int64) (*EvidenceItem, error) {
	var ev EvidenceItem
	err := s.Pool.QueryRow(ctx, `
		SELECT evidence_id, action_plan_id, COALESCE(evidence_type,'FILE'), COALESCE(evidence_text,''),
		       file_name, file_path, COALESCE(mime_type,''), file_size
		FROM evidence
		WHERE evidence_id = $1`, evidenceID).Scan(
		&ev.EvidenceID, &ev.ActionPlanID, &ev.EvidenceType, &ev.EvidenceText,
		&ev.FileName, &ev.FilePath, &ev.MimeType, &ev.FileSize)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, httpx.NewError(http.StatusNotFound, "NOT_FOUND", "Evidence tidak ditemukan.")
		}
		return nil, err
	}
	return &ev, nil
}
