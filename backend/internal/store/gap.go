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

type GapDocSummary struct {
	GapID           int        `json:"gapId"`
	GapNo           string     `json:"gapNo"`
	RegulationID    int        `json:"regulationId"`
	LegalNumber     string     `json:"legalNumber"`
	RegulationTitle string     `json:"regulationTitle"`
	SiteID          int        `json:"siteId"`
	SiteCode        string     `json:"siteCode"`
	SiteName        string     `json:"siteName"`
	CategoryID      int        `json:"categoryId"`
	CategoryCode    string     `json:"categoryCode"`
	CategoryName    string     `json:"categoryName"`
	WorkflowStatus  string     `json:"workflowStatus"`
	RevisionNo      int        `json:"revisionNo"`
	EffectiveDate   time.Time  `json:"effectiveDate"`
	TotalClauses    int        `json:"totalClauses"`
	TotalApplicable int        `json:"totalApplicable"`
	Count100        int        `json:"count100"`
	Count50         int        `json:"count50"`
	Count0          int        `json:"count0"`
	Pct100          float64    `json:"pct100"`
	Pct50           float64    `json:"pct50"`
	Pct0            float64    `json:"pct0"`
	CreatedByName      string     `json:"createdByName"`
	CreatedAt          time.Time  `json:"createdAt"`
	ReturnNotes        string     `json:"returnNotes"`
	ReturnedAt         *time.Time `json:"returnedAt"`
	ReturnedByName     string     `json:"returnedByName"`
	NeedsPicActionPlan bool       `json:"needsPicActionPlan"`
}

type GapAnalysisRow struct {
	GapAnalysisID       int64      `json:"gapAnalysisId"`
	GapID               int        `json:"gapId"`
	ClauseID            int64      `json:"clauseId"`
	SortOrder           int        `json:"sortOrder"`
	Chapter             string     `json:"chapter"`
	ClauseNo            string     `json:"clauseNo"`
	ClauseTitle         string     `json:"clauseTitle"`
	RequirementText     string     `json:"requirementText"`
	IsInfo              bool       `json:"isInfo"`
	IsApplicable        bool       `json:"isApplicable"`
	DeptInControlID     *int       `json:"deptInControlId"`
	DeptInControlCode   string     `json:"deptInControlCode"`
	DeptInControlName   string     `json:"deptInControlName"`
	DeptInControlAll    bool       `json:"deptInControlAll"`
	DeptInControlIDs    []int      `json:"deptInControlIds"`
	DeptInControlCodes  []string   `json:"deptInControlCodes"`
	CoDeptAll           bool       `json:"coDeptAll"`
	CoDeptIDs           []int      `json:"coDeptIds"`
	CoDeptCodes         []string   `json:"coDeptCodes"`
	InProcedure         *bool      `json:"inProcedure"`
	InPractice          *bool      `json:"inPractice"`
	ActualCondition     string     `json:"actualCondition"`
	RelatedDocument     string     `json:"relatedDocument"`
	ProposedStatus      *string    `json:"proposedStatus"` // '100', '50', '0'
	Status              *string    `json:"status"`         // final: '100', '50', '0', 'NA'
	ActionPlanID        *int64     `json:"actionPlanId"`
	ActionPlanText      string     `json:"actionPlanText"`
	PICUserID           *int       `json:"picUserId"`
	PICInitials         string     `json:"picInitials"`
	DueDate             *time.Time `json:"dueDate"`
	ExecutionStatus     string     `json:"executionStatus"`
	EvidenceSummary     string     `json:"evidenceSummary"`
	ApVerifiedByName    string     `json:"apVerifiedByName"`
	VerifiedByName      string     `json:"verifiedByName"`
	VerifiedAt          *time.Time `json:"verifiedAt"`
	VerificationNotes   string     `json:"verificationNotes"`
}

type ChangeNoteItem struct {
	ChangeNoteID int64  `json:"changeNoteId"`
	NewCount     int    `json:"newCount"`
	ChangedCount int    `json:"changedCount"`
	DeletedCount int    `json:"deletedCount"`
	ChangePoints string `json:"changePoints"`
}

type ApprovalSignatureItem struct {
	ApprovalID       int64      `json:"approvalId"`
	Stage            string     `json:"stage"`
	CycleNo          int        `json:"cycleNo"`
	RoleCode         string     `json:"roleCode"`
	RoleName         string     `json:"roleName"`
	DepartmentCode   string     `json:"departmentCode"`
	AssignedName     string     `json:"assignedName"`
	ActedByName      string     `json:"actedByName"`
	OnBehalfOfName   string     `json:"onBehalfOfName"`
	Result           string     `json:"result"`
	ActedAt          *time.Time `json:"actedAt"`
	SignatureMeaning string     `json:"signatureMeaning"`
}

type GapDocumentDetail struct {
	GapDocSummary
	Clauses        []GapAnalysisRow        `json:"clauses"`
	ChangeNotes    []ChangeNoteItem        `json:"changeNotes"`
	Approvals      []ApprovalSignatureItem `json:"approvals"`
	VerifiedByName string                  `json:"verifiedByName"`
	VerifiedAt     *time.Time              `json:"verifiedAt"`
}

func (s *Store) ListGapDocuments(ctx context.Context, actor *User, siteID, categoryID *int, status *string) ([]GapDocSummary, error) {
	query := `
		SELECT g.gap_id, g.gap_no, g.regulation_id, r.legal_number, r.title,
		       g.site_id, s.site_code, s.site_name,
		       g.category_id, c.category_code, c.category_name,
		       g.workflow_status::text, g.revision_no, g.effective_date,
		       COUNT(ga.gap_analysis_id)::int AS total_clauses,
		       COUNT(CASE WHEN ga.is_applicable AND NOT rc.is_info THEN 1 END)::int AS total_applicable,
		       COUNT(CASE WHEN ga.is_applicable AND NOT rc.is_info AND ga.status = '100' THEN 1 END)::int AS count_100,
		       COUNT(CASE WHEN ga.is_applicable AND NOT rc.is_info AND ga.status = '50' THEN 1 END)::int AS count_50,
		       COUNT(CASE WHEN ga.is_applicable AND NOT rc.is_info AND ga.status = '0' THEN 1 END)::int AS count_0,
		       u.full_name, g.created_at,
		       COALESCE(g.return_notes,''), g.returned_at, COALESCE(u_ret.full_name,'')
		FROM gap_document g
		JOIN regulation r ON r.regulation_id = g.regulation_id
		JOIN site s ON s.site_id = g.site_id
		JOIN category c ON c.category_id = g.category_id
		JOIN users u ON u.user_id = g.created_by
		LEFT JOIN users u_ret ON u_ret.user_id = g.returned_by
		LEFT JOIN gap_analysis ga ON ga.gap_id = g.gap_id
		LEFT JOIN regulation_clause rc ON rc.clause_id = ga.clause_id
		WHERE ($1::smallint IS NULL OR g.site_id = $1::smallint)
		  AND ($2::smallint IS NULL OR g.category_id = $2::smallint)
		  AND ($3::text = '' OR g.workflow_status::text = $3::text)
		GROUP BY g.gap_id, r.legal_number, r.title, s.site_code, s.site_name, c.category_code, c.category_name, u.full_name, u_ret.full_name
		ORDER BY g.created_at DESC`
	statusStr := ""
	if status != nil {
		statusStr = *status
	}
	rows, err := s.Pool.Query(ctx, query, siteID, categoryID, statusStr)
	if err != nil {
		return []GapDocSummary{}, err
	}
	defer rows.Close()
	out := []GapDocSummary{}
	for rows.Next() {
		var item GapDocSummary
		if err := rows.Scan(&item.GapID, &item.GapNo, &item.RegulationID, &item.LegalNumber, &item.RegulationTitle,
			&item.SiteID, &item.SiteCode, &item.SiteName,
			&item.CategoryID, &item.CategoryCode, &item.CategoryName,
			&item.WorkflowStatus, &item.RevisionNo, &item.EffectiveDate,
			&item.TotalClauses, &item.TotalApplicable,
			&item.Count100, &item.Count50, &item.Count0,
			&item.CreatedByName, &item.CreatedAt,
			&item.ReturnNotes, &item.ReturnedAt, &item.ReturnedByName); err != nil {
			return nil, err
		}
		if item.TotalApplicable > 0 {
			item.Pct100 = float64(item.Count100) / float64(item.TotalApplicable) * 100
			item.Pct50 = float64(item.Count50) / float64(item.TotalApplicable) * 100
			item.Pct0 = float64(item.Count0) / float64(item.TotalApplicable) * 100
		}
		out = append(out, item)
	}
	if err := rows.Err(); err != nil {
		return out, err
	}

	if actor != nil && actor.RoleCode == "PIC_AREA" && len(out) > 0 {
		apRows, err := s.Pool.Query(ctx, `
			SELECT DISTINCT g.gap_id
			FROM gap_document g
			JOIN gap_analysis ga ON ga.gap_id = g.gap_id
			JOIN regulation_clause rc ON rc.clause_id = ga.clause_id
			LEFT JOIN action_plan ap ON ap.gap_analysis_id = ga.gap_analysis_id
			WHERE g.workflow_status = 'ACTION_PLAN'
			  AND ga.is_applicable = TRUE
			  AND rc.is_info = FALSE
			  AND (ga.in_procedure = FALSE OR ga.in_practice = FALSE)
			  AND ($1::smallint IS NULL OR g.site_id = $1::smallint)
			  AND (ap.pic_user_id = $2::int
			       OR ga.dept_in_control_id = $3::int
			       OR ga.dept_in_control_all = TRUE
			       OR EXISTS (SELECT 1 FROM gap_analysis_dept gd WHERE gd.gap_analysis_id = ga.gap_analysis_id AND gd.department_id = $3::int))`,
			actor.SiteID, actor.ID, actor.DepartmentID)
		if err == nil {
			needMap := make(map[int]bool)
			for apRows.Next() {
				var gid int
				if apRows.Scan(&gid) == nil {
					needMap[gid] = true
				}
			}
			apRows.Close()
			for i := range out {
				if needMap[out[i].GapID] {
					out[i].NeedsPicActionPlan = true
				}
			}
		}
	}

	return out, nil
}

func (s *Store) GetGapDocumentDetail(ctx context.Context, gapID int) (*GapDocumentDetail, error) {
	var d GapDocumentDetail
	err := s.Pool.QueryRow(ctx, `
		SELECT g.gap_id, g.gap_no, g.regulation_id, r.legal_number, r.title,
		       g.site_id, s.site_code, s.site_name,
		       g.category_id, c.category_code, c.category_name,
		       g.workflow_status::text, g.revision_no, g.effective_date,
		       0, 0, 0, 0, 0, u.full_name, g.created_at,
		       COALESCE(g.return_notes,''), g.returned_at, COALESCE(u_ret.full_name,'')
		FROM gap_document g
		JOIN regulation r ON r.regulation_id = g.regulation_id
		JOIN site s ON s.site_id = g.site_id
		JOIN category c ON c.category_id = g.category_id
		JOIN users u ON u.user_id = g.created_by
		LEFT JOIN users u_ret ON u_ret.user_id = g.returned_by
		WHERE g.gap_id = $1`, gapID).Scan(
		&d.GapID, &d.GapNo, &d.RegulationID, &d.LegalNumber, &d.RegulationTitle,
		&d.SiteID, &d.SiteCode, &d.SiteName,
		&d.CategoryID, &d.CategoryCode, &d.CategoryName,
		&d.WorkflowStatus, &d.RevisionNo, &d.EffectiveDate,
		&d.TotalClauses, &d.TotalApplicable, &d.Count100, &d.Count50, &d.Count0,
		&d.CreatedByName, &d.CreatedAt,
		&d.ReturnNotes, &d.ReturnedAt, &d.ReturnedByName)
	if err != nil {
		return nil, err
	}
	d.Clauses = []GapAnalysisRow{}

	rows, err := s.Pool.Query(ctx, `
		SELECT ga.gap_analysis_id, ga.gap_id, ga.clause_id, rc.sort_order,
		       COALESCE(rc.chapter,''), rc.clause_no, COALESCE(rc.clause_title,''), rc.requirement_text, rc.is_info,
		       ga.is_applicable, ga.dept_in_control_id, COALESCE(d.department_code,''), COALESCE(d.department_name,''),
		       ga.dept_in_control_all, ga.co_dept_all,
		       ga.in_procedure, ga.in_practice, COALESCE(ga.actual_condition,''), COALESCE(ga.related_document,''),
		       ga.proposed_status::text, ga.status::text,
		       ap.action_plan_id, COALESCE(ap.plan_text,''), ap.pic_user_id, COALESCE(ap.pic_initials,''), ap.due_date,
		       COALESCE(ap.execution_status,''),
		       COALESCE((
		           SELECT string_agg(
		               CASE WHEN ev.evidence_type = 'FILE' THEN ev.file_name ELSE COALESCE(ev.evidence_text, ev.file_name) END,
		               E'\n' ORDER BY ev.evidence_id
		           )
		           FROM evidence ev
		           WHERE ev.action_plan_id = ap.action_plan_id AND ev.is_superseded = FALSE
		       ), ''),
		       COALESCE(u_apv.full_name,''),
		       COALESCE(uv.full_name,''), ga.verified_at, COALESCE(ga.verification_notes,'')
		FROM gap_analysis ga
		JOIN regulation_clause rc ON rc.clause_id = ga.clause_id
		LEFT JOIN department d ON d.department_id = ga.dept_in_control_id
		LEFT JOIN action_plan ap ON ap.gap_analysis_id = ga.gap_analysis_id
		LEFT JOIN users u_apv ON u_apv.user_id = ap.verified_by
		LEFT JOIN users uv ON uv.user_id = ga.verified_by
		WHERE ga.gap_id = $1
		ORDER BY rc.sort_order ASC`, gapID)
	if err != nil {
		return nil, err
	}
	d.Clauses = []GapAnalysisRow{}
	defer rows.Close()

	for rows.Next() {
		var row GapAnalysisRow
		row.DeptInControlIDs = []int{}
		row.DeptInControlCodes = []string{}
		row.CoDeptIDs = []int{}
		row.CoDeptCodes = []string{}
		if err := rows.Scan(&row.GapAnalysisID, &row.GapID, &row.ClauseID, &row.SortOrder,
			&row.Chapter, &row.ClauseNo, &row.ClauseTitle, &row.RequirementText, &row.IsInfo,
			&row.IsApplicable, &row.DeptInControlID, &row.DeptInControlCode, &row.DeptInControlName,
			&row.DeptInControlAll, &row.CoDeptAll,
			&row.InProcedure, &row.InPractice, &row.ActualCondition, &row.RelatedDocument,
			&row.ProposedStatus, &row.Status,
			&row.ActionPlanID, &row.ActionPlanText, &row.PICUserID, &row.PICInitials, &row.DueDate,
			&row.ExecutionStatus, &row.EvidenceSummary, &row.ApVerifiedByName,
			&row.VerifiedByName, &row.VerifiedAt, &row.VerificationNotes); err != nil {
			return nil, err
		}

		if row.IsApplicable && !row.IsInfo {
			d.TotalApplicable++
			status := ""
			if row.Status != nil {
				status = *row.Status
			} else if row.ProposedStatus != nil {
				status = *row.ProposedStatus
			}
			switch status {
			case "100":
				d.Count100++
			case "50":
				d.Count50++
			case "0":
				d.Count0++
			}
		}

		// Multi Dept In Control
		deptRows, deptErr := s.Pool.Query(ctx, `
			SELECT gd.department_id, d.department_code
			FROM gap_analysis_dept gd
			JOIN department d ON d.department_id = gd.department_id
			WHERE gd.gap_analysis_id = $1
			ORDER BY d.department_code ASC`, row.GapAnalysisID)
		if deptErr == nil {
			for deptRows.Next() {
				var did int
				var dcode string
				if deptRows.Scan(&did, &dcode) == nil {
					row.DeptInControlIDs = append(row.DeptInControlIDs, did)
					row.DeptInControlCodes = append(row.DeptInControlCodes, dcode)
				}
			}
			deptRows.Close()
		}
		if len(row.DeptInControlIDs) == 0 && row.DeptInControlID != nil && !row.DeptInControlAll {
			row.DeptInControlIDs = []int{*row.DeptInControlID}
			if row.DeptInControlCode != "" {
				row.DeptInControlCodes = []string{row.DeptInControlCode}
			}
		}

		// Co-depts
		coRows, coErr := s.Pool.Query(ctx, `
			SELECT gco.department_id, d.department_code
			FROM gap_analysis_co_dept gco
			JOIN department d ON d.department_id = gco.department_id
			WHERE gco.gap_analysis_id = $1
			ORDER BY d.department_code ASC`, row.GapAnalysisID)
		if coErr == nil {
			for coRows.Next() {
				var cid int
				var ccode string
				if coRows.Scan(&cid, &ccode) == nil {
					row.CoDeptIDs = append(row.CoDeptIDs, cid)
					row.CoDeptCodes = append(row.CoDeptCodes, ccode)
				}
			}
			coRows.Close()
		}

		d.Clauses = append(d.Clauses, row)
	}

	d.TotalClauses = len(d.Clauses)
	if d.TotalApplicable > 0 {
		d.Pct100 = float64(d.Count100) / float64(d.TotalApplicable) * 100
		d.Pct50 = float64(d.Count50) / float64(d.TotalApplicable) * 100
		d.Pct0 = float64(d.Count0) / float64(d.TotalApplicable) * 100
	}

	// Change notes (007E)
	d.ChangeNotes = []ChangeNoteItem{}
	cnRows, err := s.Pool.Query(ctx, `
		SELECT change_note_id, new_count, changed_count, deleted_count, COALESCE(change_points, '')
		FROM change_note WHERE gap_id = $1 ORDER BY change_note_id ASC`, gapID)
	if err == nil {
		for cnRows.Next() {
			var cn ChangeNoteItem
			if cnRows.Scan(&cn.ChangeNoteID, &cn.NewCount, &cn.ChangedCount, &cn.DeletedCount, &cn.ChangePoints) == nil {
				d.ChangeNotes = append(d.ChangeNotes, cn)
			}
		}
		cnRows.Close()
	}

	// Approvals with signatures (009A, 010B)
	d.Approvals = []ApprovalSignatureItem{}
	appRows, err := s.Pool.Query(ctx, `
		SELECT a.approval_id, a.stage::text, a.cycle_no, r.role_code, r.role_name,
		       COALESCE(d.department_code, ''),
		       u_asg.full_name, COALESCE(u_act.full_name, ''), COALESCE(u_obh.full_name, ''),
		       a.result::text, a.acted_at, COALESCE(a.signature_meaning, '')
		FROM approval a
		JOIN role r ON r.role_id = a.role_id
		JOIN users u_asg ON u_asg.user_id = a.assigned_user_id
		LEFT JOIN users u_act ON u_act.user_id = a.acted_by_user_id
		LEFT JOIN users u_obh ON u_obh.user_id = a.on_behalf_of_user_id
		LEFT JOIN department d ON d.department_id = a.department_id
		WHERE a.gap_id = $1
		ORDER BY a.stage, a.cycle_no DESC, a.step_seq, a.approval_id ASC`, gapID)
	if err == nil {
		for appRows.Next() {
			var ap ApprovalSignatureItem
			if appRows.Scan(&ap.ApprovalID, &ap.Stage, &ap.CycleNo, &ap.RoleCode, &ap.RoleName,
				&ap.DepartmentCode, &ap.AssignedName, &ap.ActedByName, &ap.OnBehalfOfName,
				&ap.Result, &ap.ActedAt, &ap.SignatureMeaning) == nil {
				d.Approvals = append(d.Approvals, ap)
			}
		}
		appRows.Close()
	}

	// Supervisor verification info
	_ = s.Pool.QueryRow(ctx, `
		SELECT u.full_name, ga.verified_at
		FROM gap_analysis ga
		JOIN users u ON u.user_id = ga.verified_by
		WHERE ga.gap_id = $1 AND ga.verified_by IS NOT NULL
		LIMIT 1`, gapID).Scan(&d.VerifiedByName, &d.VerifiedAt)

	return &d, rows.Err()
}

type UpdateGapAnalysisItemReq struct {
	GapAnalysisID    int64      `json:"gapAnalysisId"`
	IsApplicable     bool       `json:"isApplicable"`
	DeptInControlID  *int       `json:"deptInControlId"`
	DeptInControlIDs []int      `json:"deptInControlIds"`
	DeptInControlAll bool       `json:"deptInControlAll"`
	CoDeptIDs        []int      `json:"coDeptIds"`
	CoDeptAll        bool       `json:"coDeptAll"`
	InProcedure      *bool      `json:"inProcedure"`
	InPractice       *bool      `json:"inPractice"`
	ActualCondition  string     `json:"actualCondition"`
	RelatedDocument  string     `json:"relatedDocument"`
	ActionPlanText   string     `json:"actionPlanText"`
	PICUserID        *int       `json:"picUserId"`
	PICInitials      string     `json:"picInitials"`
	DueDate          *time.Time `json:"dueDate"`
}

func applyGapAnalysisItems(ctx context.Context, tx pgx.Tx, gapID int, items []UpdateGapAnalysisItemReq, mode string, allowedDeptID *int) error {
	// mode: "DRAFT_GAP_ONLY" | "ACTION_PLAN_ONLY" | "FULL"
	actionPlanOnly := mode == "ACTION_PLAN_ONLY"
	draftGapOnly := mode == "DRAFT_GAP_ONLY"

	for _, item := range items {
		var isApplicable, isComply100 bool

		if actionPlanOnly {
			var isInfo, deptMatch bool
			var inProc, inPrac *bool
			err := tx.QueryRow(ctx, `
				SELECT ga.is_applicable, rc.is_info, ga.in_procedure, ga.in_practice,
				       CASE WHEN $3::int IS NULL THEN TRUE
				            ELSE (COALESCE(ga.dept_in_control_id = $3::int, FALSE)
				                  OR ga.dept_in_control_all = TRUE
				                  OR EXISTS (SELECT 1 FROM gap_analysis_dept gd WHERE gd.gap_analysis_id = ga.gap_analysis_id AND gd.department_id = $3::int))
				       END
				FROM gap_analysis ga
				JOIN regulation_clause rc ON rc.clause_id = ga.clause_id
				WHERE ga.gap_analysis_id = $1 AND ga.gap_id = $2`,
				item.GapAnalysisID, gapID, allowedDeptID).Scan(&isApplicable, &isInfo, &inProc, &inPrac, &deptMatch)
			if err != nil {
				return fmt.Errorf("lookup gap analysis %d: %w", item.GapAnalysisID, err)
			}
			if isInfo || !isApplicable || !deptMatch {
				continue
			}
			if inProc == nil || inPrac == nil {
				continue
			}
			isComply100 = *inProc && *inPrac
		} else {
			// Calculate proposed status per URS 008A rule:
			// in_procedure & in_practice = 100; neither = 0; one = 50.
			isApplicable = item.IsApplicable
			var proposedStatus *string
			if item.IsApplicable && item.InProcedure != nil && item.InPractice != nil {
				var p string
				if *item.InProcedure && *item.InPractice {
					p = "100"
					isComply100 = true
				} else if !*item.InProcedure && !*item.InPractice {
					p = "0"
				} else {
					p = "50"
				}
				proposedStatus = &p
			}

			// Sync primary dept_in_control_id for legacy queries/views
			primaryDeptID := item.DeptInControlID
			if !item.DeptInControlAll && len(item.DeptInControlIDs) > 0 {
				id := item.DeptInControlIDs[0]
				primaryDeptID = &id
			} else if item.DeptInControlAll {
				primaryDeptID = nil
			}

			_, err := tx.Exec(ctx, `
				UPDATE gap_analysis
				SET is_applicable = $2, dept_in_control_id = $3,
				    dept_in_control_all = $4, co_dept_all = $5,
				    in_procedure = $6, in_practice = $7,
				    actual_condition = NULLIF($8,''), related_document = NULLIF($9,''),
				    proposed_status = $10::gap_status,
				    status = CASE WHEN $2 = FALSE THEN 'NA'::gap_status ELSE status END
				WHERE gap_analysis_id = $1 AND gap_id = $11`,
				item.GapAnalysisID, item.IsApplicable, primaryDeptID,
				item.DeptInControlAll, item.CoDeptAll,
				item.InProcedure, item.InPractice, item.ActualCondition, item.RelatedDocument,
				proposedStatus, gapID)
			if err != nil {
				return fmt.Errorf("update gap analysis %d: %w", item.GapAnalysisID, err)
			}

			// Update Dept In Control join table
			_, _ = tx.Exec(ctx, `DELETE FROM gap_analysis_dept WHERE gap_analysis_id = $1`, item.GapAnalysisID)
			if !item.DeptInControlAll {
				deptList := item.DeptInControlIDs
				if len(deptList) == 0 && primaryDeptID != nil {
					deptList = []int{*primaryDeptID}
				}
				for _, did := range deptList {
					_, _ = tx.Exec(ctx, `
						INSERT INTO gap_analysis_dept (gap_analysis_id, department_id)
						VALUES ($1, $2) ON CONFLICT DO NOTHING`, item.GapAnalysisID, did)
				}
			}

			// Update co-depts join table
			_, _ = tx.Exec(ctx, `DELETE FROM gap_analysis_co_dept WHERE gap_analysis_id = $1`, item.GapAnalysisID)
			if !item.CoDeptAll {
				for _, coDeptID := range item.CoDeptIDs {
					_, _ = tx.Exec(ctx, `
						INSERT INTO gap_analysis_co_dept (gap_analysis_id, department_id)
						VALUES ($1, $2) ON CONFLICT DO NOTHING`, item.GapAnalysisID, coDeptID)
				}
			}
		}

		// When NA or 100% comply (both inProcedure & inPractice = true), Action Plan / PIC / Due Date are NA
		if !isApplicable || isComply100 {
			_, _ = tx.Exec(ctx, `DELETE FROM action_plan WHERE gap_analysis_id = $1`, item.GapAnalysisID)
			continue
		}
		if draftGapOnly {
			// Co Gap Staff only fills Gap Analysis during DRAFT; preserve existing action plan if returning from review.
			continue
		}

		planTrimmed := strings.TrimSpace(item.ActionPlanText)
		if planTrimmed == "" && item.PICUserID == nil && item.DueDate == nil {
			_, _ = tx.Exec(ctx, `DELETE FROM action_plan WHERE gap_analysis_id = $1`, item.GapAnalysisID)
		} else {
			tag, err := tx.Exec(ctx, `
				UPDATE action_plan
				SET plan_text = NULLIF($2,''), pic_user_id = $3, pic_initials = NULLIF($4,''),
				    due_date = CASE WHEN $5::date IS NULL THEN NULL ELSE GREATEST($5::date, create_date) END
				WHERE gap_analysis_id = $1`,
				item.GapAnalysisID, planTrimmed, item.PICUserID, item.PICInitials, item.DueDate)
			if err != nil {
				return fmt.Errorf("update action plan for ga %d: %w", item.GapAnalysisID, err)
			}
			if tag.RowsAffected() == 0 {
				_, err = tx.Exec(ctx, `
					INSERT INTO action_plan (gap_analysis_id, plan_text, pic_user_id, pic_initials, due_date)
					VALUES ($1, NULLIF($2,''), $3, NULLIF($4,''), CASE WHEN $5::date IS NULL THEN NULL ELSE GREATEST($5::date, CURRENT_DATE) END)`,
					item.GapAnalysisID, planTrimmed, item.PICUserID, item.PICInitials, item.DueDate)
				if err != nil {
					return fmt.Errorf("insert action plan for ga %d: %w", item.GapAnalysisID, err)
				}
			}
		}
	}
	if !actionPlanOnly {
		if err := syncMasterListInterestedPartiesTx(ctx, tx, gapID); err != nil {
			return err
		}
	}
	return nil
}

func syncMasterListInterestedPartiesTx(ctx context.Context, tx pgx.Tx, gapID int) error {
	var mlItemID int
	var siteID int
	err := tx.QueryRow(ctx, `
		SELECT mli.master_list_item_id, g.site_id
		FROM master_list_item mli
		JOIN gap_document g ON g.gap_id = mli.gap_id
		WHERE mli.gap_id = $1
		LIMIT 1`, gapID).Scan(&mlItemID, &siteID)
	if err != nil {
		// Not every gap doc is guaranteed to have a master_list_item row; ignore if none.
		return nil
	}

	if _, err := tx.Exec(ctx, `DELETE FROM master_list_item_department WHERE master_list_item_id = $1`, mlItemID); err != nil {
		return fmt.Errorf("clear interested parties: %w", err)
	}

	var hasAll bool
	if err := tx.QueryRow(ctx, `
		SELECT EXISTS (
			SELECT 1
			FROM gap_analysis ga
			JOIN regulation_clause rc ON rc.clause_id = ga.clause_id
			WHERE ga.gap_id = $1
			  AND ga.is_applicable = TRUE
			  AND rc.is_info = FALSE
			  AND (ga.dept_in_control_all = TRUE OR ga.co_dept_all = TRUE)
		)`, gapID).Scan(&hasAll); err != nil {
		return fmt.Errorf("check all interested parties: %w", err)
	}

	if hasAll {
		_, err = tx.Exec(ctx, `
			INSERT INTO master_list_item_department (master_list_item_id, department_id)
			SELECT $1::int, d.department_id
			FROM department d
			WHERE d.site_id = $2 AND d.is_active = TRUE
			ON CONFLICT DO NOTHING`, mlItemID, siteID)
		if err != nil {
			return fmt.Errorf("sync all interested parties: %w", err)
		}
		return nil
	}

	_, err = tx.Exec(ctx, `
		INSERT INTO master_list_item_department (master_list_item_id, department_id)
		SELECT DISTINCT $1::int, dept_id
		FROM (
			SELECT gd.department_id AS dept_id
			FROM gap_analysis ga
			JOIN regulation_clause rc ON rc.clause_id = ga.clause_id
			JOIN gap_analysis_dept gd ON gd.gap_analysis_id = ga.gap_analysis_id
			WHERE ga.gap_id = $2 AND ga.is_applicable = TRUE AND rc.is_info = FALSE
			UNION
			SELECT ga.dept_in_control_id AS dept_id
			FROM gap_analysis ga
			JOIN regulation_clause rc ON rc.clause_id = ga.clause_id
			WHERE ga.gap_id = $2 AND ga.is_applicable = TRUE AND rc.is_info = FALSE AND ga.dept_in_control_id IS NOT NULL
			UNION
			SELECT gco.department_id AS dept_id
			FROM gap_analysis ga
			JOIN regulation_clause rc ON rc.clause_id = ga.clause_id
			JOIN gap_analysis_co_dept gco ON gco.gap_analysis_id = ga.gap_analysis_id
			WHERE ga.gap_id = $2 AND ga.is_applicable = TRUE AND rc.is_info = FALSE
		) src
		ON CONFLICT DO NOTHING`, mlItemID, gapID)
	if err != nil {
		return fmt.Errorf("sync interested parties: %w", err)
	}
	return nil
}

func validateDraftGapBeforeSubmit(ctx context.Context, tx pgx.Tx, gapID int) error {
	var missingEvalClause string
	err := tx.QueryRow(ctx, `
		SELECT rc.clause_no
		FROM gap_analysis ga
		JOIN regulation_clause rc ON rc.clause_id = ga.clause_id
		WHERE ga.gap_id = $1
		  AND ga.is_applicable = TRUE
		  AND rc.is_info = FALSE
		  AND (ga.in_procedure IS NULL OR ga.in_practice IS NULL)
		ORDER BY rc.sort_order ASC
		LIMIT 1`, gapID).Scan(&missingEvalClause)
	if err == nil && missingEvalClause != "" {
		return httpx.NewError(http.StatusBadRequest, "INCOMPLETE_EVALUATION",
			fmt.Sprintf("Klausul %s belum dilengkapi pilihan Included In Procedure dan Is Performed in Actual Practices.", missingEvalClause))
	}
	if err != nil && err != pgx.ErrNoRows {
		return err
	}

	var missingDeptClause string
	err = tx.QueryRow(ctx, `
		SELECT rc.clause_no
		FROM gap_analysis ga
		JOIN regulation_clause rc ON rc.clause_id = ga.clause_id
		WHERE ga.gap_id = $1
		  AND ga.is_applicable = TRUE
		  AND rc.is_info = FALSE
		  AND (ga.in_procedure = FALSE OR ga.in_practice = FALSE)
		  AND ga.dept_in_control_all = FALSE
		  AND ga.dept_in_control_id IS NULL
		  AND NOT EXISTS (SELECT 1 FROM gap_analysis_dept gd WHERE gd.gap_analysis_id = ga.gap_analysis_id)
		ORDER BY rc.sort_order ASC
		LIMIT 1`, gapID).Scan(&missingDeptClause)
	if err == nil && missingDeptClause != "" {
		return httpx.NewError(http.StatusBadRequest, "MISSING_DEPT",
			fmt.Sprintf("Klausul %s berstatus di bawah 100%%, sehingga Dept In Control wajib dipilih agar dapat diteruskan ke PIC Area.", missingDeptClause))
	}
	if err != nil && err != pgx.ErrNoRows {
		return err
	}
	return nil
}

func validateActionPlansBeforeAdvance(ctx context.Context, tx pgx.Tx, gapID int) error {
	var missingClause, deptLabel string
	err := tx.QueryRow(ctx, `
		SELECT rc.clause_no,
		       COALESCE(
		         CASE WHEN ga.dept_in_control_all THEN 'All dept'
		              ELSE NULLIF((SELECT string_agg(d2.department_code, ', ' ORDER BY d2.department_code)
		                           FROM gap_analysis_dept gd2
		                           JOIN department d2 ON d2.department_id = gd2.department_id
		                           WHERE gd2.gap_analysis_id = ga.gap_analysis_id), '')
		         END,
		         (SELECT d.department_code FROM department d WHERE d.department_id = ga.dept_in_control_id),
		         '-'
		       )
		FROM gap_analysis ga
		JOIN regulation_clause rc ON rc.clause_id = ga.clause_id
		LEFT JOIN action_plan ap ON ap.gap_analysis_id = ga.gap_analysis_id
		WHERE ga.gap_id = $1
		  AND ga.is_applicable = TRUE
		  AND rc.is_info = FALSE
		  AND (ga.in_procedure = FALSE OR ga.in_practice = FALSE)
		  AND (
		      ap.action_plan_id IS NULL
		      OR COALESCE(BTRIM(ap.plan_text), '') = ''
		      OR ap.pic_user_id IS NULL
		      OR ap.due_date IS NULL
		  )
		ORDER BY rc.sort_order ASC
		LIMIT 1`, gapID).Scan(&missingClause, &deptLabel)
	if err == nil && missingClause != "" {
		return httpx.NewError(http.StatusBadRequest, "INCOMPLETE_ACTION_PLAN",
			fmt.Sprintf("Klausul %s (Dept: %s) belum diisi Action Plan, PIC, dan Due Date.", missingClause, deptLabel))
	}
	if err != nil && err != pgx.ErrNoRows {
		return err
	}
	return nil
}

func notifyPICForActionPlanTx(ctx context.Context, tx pgx.Tx, gapID int, gapNo string, siteID int, subject, body string) error {
	rows, err := tx.Query(ctx, `
		SELECT DISTINCT u.user_id
		FROM gap_analysis ga
		JOIN regulation_clause rc ON rc.clause_id = ga.clause_id
		JOIN users u ON u.site_id = $2 AND u.is_active = TRUE
		JOIN role r ON r.role_id = u.role_id AND r.role_code = 'PIC_AREA'
		WHERE ga.gap_id = $1
		  AND ga.is_applicable = TRUE
		  AND rc.is_info = FALSE
		  AND (ga.in_procedure = FALSE OR ga.in_practice = FALSE)
		  AND (
		      ga.dept_in_control_all = TRUE
		      OR ga.dept_in_control_id = u.department_id
		      OR EXISTS (
		          SELECT 1 FROM gap_analysis_dept gd
		          WHERE gd.gap_analysis_id = ga.gap_analysis_id AND gd.department_id = u.department_id
		      )
		  )`, gapID, siteID)
	if err != nil {
		return err
	}
	var ids []int
	for rows.Next() {
		var uid int
		if rows.Scan(&uid) == nil {
			ids = append(ids, uid)
		}
	}
	rows.Close()
	for _, uid := range ids {
		if err := insertNotificationTx(ctx, tx, "ACTION_PLAN_REQUIRED", uid, &gapID, nil, subject, body); err != nil {
			return err
		}
	}
	return nil
}

func notifyStaffForSiteTx(ctx context.Context, tx pgx.Tx, siteID int, eventType string, gapID *int, subject, body string) error {
	rows, err := tx.Query(ctx, `
		SELECT u.user_id
		FROM users u
		JOIN role r ON r.role_id = u.role_id
		WHERE r.role_code = 'CO_GAP_STAFF' AND u.is_active = TRUE
		  AND (u.site_id = $1 OR NOT EXISTS (
		      SELECT 1 FROM users u2
		      JOIN role r2 ON r2.role_id = u2.role_id
		      WHERE r2.role_code = 'CO_GAP_STAFF' AND u2.is_active = TRUE AND u2.site_id = $1
		  ))`, siteID)
	if err != nil {
		return err
	}
	var ids []int
	for rows.Next() {
		var uid int
		if rows.Scan(&uid) == nil {
			ids = append(ids, uid)
		}
	}
	rows.Close()
	for _, uid := range ids {
		if err := insertNotificationTx(ctx, tx, eventType, uid, gapID, nil, subject, body); err != nil {
			return err
		}
	}
	return nil
}

func (s *Store) SaveGapAnalysisDraft(ctx context.Context, actor *User, gapID int, items []UpdateGapAnalysisItemReq) error {
	if actor == nil {
		return httpx.NewError(http.StatusUnauthorized, "UNAUTHORIZED", "Unauthorized")
	}
	return s.WithTx(ctx, actor.ID, func(tx pgx.Tx) error {
		var wfStatus string
		var siteID int
		err := tx.QueryRow(ctx, `
			SELECT workflow_status::text, site_id
			FROM gap_document
			WHERE gap_id = $1
			FOR UPDATE`, gapID).Scan(&wfStatus, &siteID)
		if err != nil {
			if err == pgx.ErrNoRows {
				return httpx.NewError(http.StatusNotFound, "NOT_FOUND", "Gap document not found.")
			}
			return err
		}

		mode := "DRAFT_GAP_ONLY"
		var allowedDeptID *int
		switch wfStatus {
		case "DRAFT":
			if actor.RoleCode != "CO_GAP_STAFF" && actor.RoleCode != "CO_GAP_SUPERVISOR" {
				return httpx.NewError(http.StatusForbidden, "FORBIDDEN", "Hanya Co Gap Staff atau Co Gap Supervisor yang dapat menyimpan draft pada tahap ini.")
			}
		case "SUPERVISOR_VERIFICATION":
			if actor.RoleCode != "CO_GAP_SUPERVISOR" {
				return httpx.NewError(http.StatusForbidden, "FORBIDDEN", "Hanya Co Gap Supervisor yang dapat mengubah dokumen pada tahap verifikasi.")
			}
			mode = "FULL"
		case "ACTION_PLAN":
			if actor.RoleCode != "PIC_AREA" {
				return httpx.NewError(http.StatusForbidden, "FORBIDDEN", "Hanya PIC Area yang dapat mengisi Action Plan, PIC, dan Due Date pada tahap ini.")
			}
			if actor.SiteID == nil || *actor.SiteID != siteID || actor.DepartmentID == nil {
				return httpx.NewError(http.StatusForbidden, "FORBIDDEN", "PIC hanya dapat mengisi Action Plan pada site dan departemennya sendiri.")
			}
			mode = "ACTION_PLAN_ONLY"
			allowedDeptID = actor.DepartmentID
		case "STAFF_REVIEW":
			if actor.RoleCode != "CO_GAP_STAFF" {
				return httpx.NewError(http.StatusForbidden, "FORBIDDEN", "Hanya Co Gap Staff yang dapat menyimpan dokumen pada tahap Staff Review.")
			}
			mode = "DRAFT_GAP_ONLY"
		default:
			return httpx.NewError(http.StatusConflict, "WORKFLOW_LOCKED",
				fmt.Sprintf("Dokumen berstatus %s tidak dapat disimpan sebagai draft.", wfStatus))
		}

		return applyGapAnalysisItems(ctx, tx, gapID, items, mode, allowedDeptID)
	})
}

func (s *Store) SubmitGapDocument(ctx context.Context, actor *User, gapID int) (string, error) {
	if actor == nil {
		return "", httpx.NewError(http.StatusUnauthorized, "UNAUTHORIZED", "Unauthorized")
	}
	var nextStatus string
	err := s.WithTx(ctx, actor.ID, func(tx pgx.Tx) error {
		var wfStatus, gapNo string
		var siteID int
		err := tx.QueryRow(ctx, `
			SELECT workflow_status::text, gap_no, site_id
			FROM gap_document
			WHERE gap_id = $1
			FOR UPDATE`, gapID).Scan(&wfStatus, &gapNo, &siteID)
		if err != nil {
			if err == pgx.ErrNoRows {
				return httpx.NewError(http.StatusNotFound, "NOT_FOUND", "Gap document not found.")
			}
			return err
		}

		switch wfStatus {
		case "DRAFT":
			if actor.RoleCode != "CO_GAP_STAFF" && actor.RoleCode != "CO_GAP_SUPERVISOR" {
				return httpx.NewError(http.StatusForbidden, "FORBIDDEN", "Hanya Co Gap Staff atau Co Gap Supervisor yang dapat melakukan submit draft.")
			}
			if err := validateDraftGapBeforeSubmit(ctx, tx, gapID); err != nil {
				return err
			}

			nextStatus = "SUPERVISOR_VERIFICATION"
			if _, err := tx.Exec(ctx, `
				UPDATE gap_document
				SET workflow_status = 'SUPERVISOR_VERIFICATION',
				    submitted_at = now(),
				    return_notes = NULL,
				    returned_at = NULL,
				    returned_by = NULL
				WHERE gap_id = $1`, gapID); err != nil {
				return err
			}
			return notifySupervisorsForSiteTx(ctx, tx, siteID, "SUPERVISOR_VERIFICATION", &gapID, nil,
				fmt.Sprintf("[%s] Cek & Verifikasi Gap Analysis", gapNo),
				fmt.Sprintf("Dokumen %s telah disubmit ke Co Gap Supervisor untuk dicek dan diteruskan ke PIC Area / Stage 1.", gapNo))

		case "ACTION_PLAN":
			if actor.RoleCode != "PIC_AREA" {
				return httpx.NewError(http.StatusForbidden, "FORBIDDEN", "Hanya PIC Area yang dapat melakukan submit Action Plan.")
			}
			if actor.SiteID == nil || *actor.SiteID != siteID || actor.DepartmentID == nil {
				return httpx.NewError(http.StatusForbidden, "FORBIDDEN", "PIC hanya dapat melakukan submit pada site dan departemennya sendiri.")
			}
			if err := validateActionPlansBeforeAdvance(ctx, tx, gapID); err != nil {
				return err
			}
			nextStatus = "STAFF_REVIEW"
			if _, err := tx.Exec(ctx, `
				UPDATE gap_document
				SET workflow_status = 'STAFF_REVIEW',
				    submitted_at = now(),
				    return_notes = NULL,
				    returned_at = NULL,
				    returned_by = NULL
				WHERE gap_id = $1`, gapID); err != nil {
				return err
			}
			return notifyStaffForSiteTx(ctx, tx, siteID, "STAFF_REVIEW", &gapID,
				fmt.Sprintf("[%s] Cek Kelengkapan Action Plan PIC", gapNo),
				fmt.Sprintf("Action Plan untuk dokumen %s telah dilengkapi oleh PIC Area dan menunggu pengecekan Co Gap Staff sebelum diteruskan ke Co Gap Supervisor.", gapNo))

		case "STAFF_REVIEW":
			if actor.RoleCode != "CO_GAP_STAFF" {
				return httpx.NewError(http.StatusForbidden, "FORBIDDEN", "Hanya Co Gap Staff yang dapat meneruskan dokumen ke Co Gap Supervisor.")
			}
			if err := validateDraftGapBeforeSubmit(ctx, tx, gapID); err != nil {
				return err
			}
			if err := validateActionPlansBeforeAdvance(ctx, tx, gapID); err != nil {
				return err
			}
			nextStatus = "SUPERVISOR_VERIFICATION"
			if _, err := tx.Exec(ctx, `
				UPDATE gap_document
				SET workflow_status = 'SUPERVISOR_VERIFICATION',
				    submitted_at = now(),
				    return_notes = NULL,
				    returned_at = NULL,
				    returned_by = NULL
				WHERE gap_id = $1`, gapID); err != nil {
				return err
			}
			return notifySupervisorsForSiteTx(ctx, tx, siteID, "SUPERVISOR_VERIFICATION", &gapID, nil,
				fmt.Sprintf("[%s] Verifikasi Gap Assessment", gapNo),
				fmt.Sprintf("Dokumen %s dan Action Plan PIC telah diperiksa oleh Co Gap Staff dan siap diverifikasi ke Stage 1.", gapNo))

		default:
			return httpx.NewError(http.StatusConflict, "INVALID_STATE",
				fmt.Sprintf("Dokumen berstatus %s tidak dapat disubmit.", wfStatus))
		}
	})
	return nextStatus, err
}

func (s *Store) ReturnGapToPicByStaff(ctx context.Context, actor *User, gapID int, returnNotes string) error {
	if actor == nil || actor.RoleCode != "CO_GAP_STAFF" {
		return httpx.NewError(http.StatusForbidden, "FORBIDDEN", "Hanya Co Gap Staff yang dapat mengembalikan Action Plan ke PIC Area.")
	}
	trimmed := strings.TrimSpace(returnNotes)
	if trimmed == "" {
		return httpx.NewError(http.StatusBadRequest, "NOTES_REQUIRED", "Catatan return wajib diisi.")
	}
	return s.WithTx(ctx, actor.ID, func(tx pgx.Tx) error {
		var wfStatus, gapNo string
		var siteID int
		err := tx.QueryRow(ctx, `
			SELECT workflow_status::text, gap_no, site_id
			FROM gap_document
			WHERE gap_id = $1
			FOR UPDATE`, gapID).Scan(&wfStatus, &gapNo, &siteID)
		if err != nil {
			if err == pgx.ErrNoRows {
				return httpx.NewError(http.StatusNotFound, "NOT_FOUND", "Gap document not found.")
			}
			return err
		}
		if wfStatus != "STAFF_REVIEW" {
			return httpx.NewError(http.StatusConflict, "INVALID_STATE",
				fmt.Sprintf("Dokumen berstatus %s tidak dapat dikembalikan ke PIC Area.", wfStatus))
		}
		if _, err := tx.Exec(ctx, `
			UPDATE gap_document
			SET workflow_status = 'ACTION_PLAN',
			    return_notes = $2,
			    returned_at = now(),
			    returned_by = $3
			WHERE gap_id = $1`, gapID, trimmed, actor.ID); err != nil {
			return err
		}
		return notifyPICForActionPlanTx(ctx, tx, gapID, gapNo, siteID,
			fmt.Sprintf("[%s] Action Plan Dikembalikan oleh Co Gap Staff", gapNo),
			fmt.Sprintf("Dokumen %s dikembalikan ke PIC Area untuk revisi Action Plan. Catatan: %s", gapNo, trimmed))
	})
}

type VerifyClauseReq struct {
	GapAnalysisID int64  `json:"gapAnalysisId"`
	Status        string `json:"status"` // '100', '50', '0', 'NA'
	Notes         string `json:"notes"`
}

func (s *Store) VerifyGapSupervisor(ctx context.Context, actorUserID int, actorRole string, gapID int, returnDraft bool, sendToPIC bool, returnNotes string, clauses []VerifyClauseReq, items []UpdateGapAnalysisItemReq) (string, error) {
	if actorRole != "CO_GAP_SUPERVISOR" {
		return "", httpx.NewError(http.StatusForbidden, "FORBIDDEN", "Hanya Co Gap Supervisor yang dapat memverifikasi dokumen.")
	}
	var nextStatus string
	err := s.WithTx(ctx, actorUserID, func(tx pgx.Tx) error {
		var wfStatus, gapNo string
		var siteID int
		err := tx.QueryRow(ctx, `
			SELECT workflow_status::text, gap_no, site_id
			FROM gap_document
			WHERE gap_id = $1
			FOR UPDATE`, gapID).Scan(&wfStatus, &gapNo, &siteID)
		if err != nil {
			if err == pgx.ErrNoRows {
				return httpx.NewError(http.StatusNotFound, "NOT_FOUND", "Gap document not found.")
			}
			return err
		}
		if wfStatus != "SUPERVISOR_VERIFICATION" && wfStatus != "DRAFT" {
			return httpx.NewError(http.StatusConflict, "INVALID_STATE",
				fmt.Sprintf("Dokumen berstatus %s tidak berada di tahap yang dapat diverifikasi Supervisor.", wfStatus))
		}

		if len(items) > 0 {
			if err := applyGapAnalysisItems(ctx, tx, gapID, items, "FULL", nil); err != nil {
				return err
			}
		}

		if returnDraft {
			trimmedNotes := strings.TrimSpace(returnNotes)
			if trimmedNotes == "" {
				return httpx.NewError(http.StatusBadRequest, "NOTES_REQUIRED", "Catatan return wajib diisi.")
			}
			nextStatus = "DRAFT"
			if _, err := tx.Exec(ctx, `
				UPDATE gap_document
				SET workflow_status = 'DRAFT',
				    return_notes = $2,
				    returned_at = now(),
				    returned_by = $3
				WHERE gap_id = $1`, gapID, trimmedNotes, actorUserID); err != nil {
				return err
			}
			return notifyStaffForSiteTx(ctx, tx, siteID, "GAP_RETURNED", &gapID,
				fmt.Sprintf("[%s] Dikembalikan oleh Supervisor", gapNo),
				fmt.Sprintf("Dokumen %s dikembalikan ke Draft. Catatan: %s", gapNo, trimmedNotes))
		}

		if err := validateDraftGapBeforeSubmit(ctx, tx, gapID); err != nil {
			return err
		}

		if sendToPIC {
			var hasBelow100 bool
			_ = tx.QueryRow(ctx, `
				SELECT EXISTS (
					SELECT 1
					FROM gap_analysis ga
					JOIN regulation_clause rc ON rc.clause_id = ga.clause_id
					WHERE ga.gap_id = $1
					  AND ga.is_applicable = TRUE
					  AND rc.is_info = FALSE
					  AND (ga.in_procedure = FALSE OR ga.in_practice = FALSE)
				)`, gapID).Scan(&hasBelow100)
			if !hasBelow100 {
				return httpx.NewError(http.StatusBadRequest, "NO_ACTION_PLAN_NEEDED",
					"Seluruh klausul sudah 100% atau N/A, tidak perlu dikirim ke PIC Area. Silakan pilih Approve Verification ke Stage 1.")
			}
			nextStatus = "ACTION_PLAN"
			if _, err := tx.Exec(ctx, `
				UPDATE gap_document
				SET workflow_status = 'ACTION_PLAN',
				    return_notes = NULL,
				    returned_at = NULL,
				    returned_by = NULL
				WHERE gap_id = $1`, gapID); err != nil {
				return err
			}
			return notifyPICForActionPlanTx(ctx, tx, gapID, gapNo, siteID,
				fmt.Sprintf("[%s] Isi Action Plan", gapNo),
				fmt.Sprintf("Dokumen %s telah dicek Co Gap Supervisor dan memiliki klausul di bawah 100%%. Silakan lengkapi Action Plan, PIC, dan Due Date departemen Anda.", gapNo))
		}

		if err := validateActionPlansBeforeAdvance(ctx, tx, gapID); err != nil {
			return err
		}

		// Apply final verified status
		hasBelow100 := false
		for _, c := range clauses {
			if c.Status == "50" || c.Status == "0" {
				hasBelow100 = true
			}
			_, err := tx.Exec(ctx, `
				UPDATE gap_analysis
				SET status = $2::gap_status, verified_by = $3, verified_at = now(), verification_notes = NULLIF($4,'')
				WHERE gap_analysis_id = $1 AND gap_id = $5`,
				c.GapAnalysisID, c.Status, actorUserID, c.Notes, gapID)
			if err != nil {
				return err
			}
		}

		// Check gap doc details (category, cycle, reqQA)
		var catID, cycle int
		var reqQA bool
		err = tx.QueryRow(ctx, `
			SELECT g.category_id, g.approval_cycle, c.requires_qa_manager
			FROM gap_document g
			JOIN category c ON c.category_id = g.category_id
			WHERE g.gap_id = $1`, gapID).Scan(&catID, &cycle, &reqQA)
		if err != nil {
			return err
		}

		// Next workflow status: APPROVAL_STAGE1 (and clear any prior return note)
		_, err = tx.Exec(ctx, `
			UPDATE gap_document
			SET workflow_status = 'APPROVAL_STAGE1',
			    return_notes = NULL,
			    returned_at = NULL,
			    returned_by = NULL
			WHERE gap_id = $1`, gapID)
		if err != nil {
			return err
		}

		if err := createApprovalChainTx(ctx, tx, gapID, gapNo, "STAGE1", cycle, siteID, reqQA); err != nil {
			return err
		}

		_ = hasBelow100
		nextStatus = "APPROVAL_STAGE1"
		return nil
	})
	return nextStatus, err
}
