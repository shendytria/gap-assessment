package store

import (
	"context"
	"fmt"
	"time"

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
	CreatedByName   string     `json:"createdByName"`
	CreatedAt       time.Time  `json:"createdAt"`
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
	VerifiedByName      string     `json:"verifiedByName"`
	VerifiedAt          *time.Time `json:"verifiedAt"`
	VerificationNotes   string     `json:"verificationNotes"`
}

type GapDocumentDetail struct {
	GapDocSummary
	Clauses []GapAnalysisRow `json:"clauses"`
}

func (s *Store) ListGapDocuments(ctx context.Context, siteID, categoryID *int, status *string) ([]GapDocSummary, error) {
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
		       u.full_name, g.created_at
		FROM gap_document g
		JOIN regulation r ON r.regulation_id = g.regulation_id
		JOIN site s ON s.site_id = g.site_id
		JOIN category c ON c.category_id = g.category_id
		JOIN users u ON u.user_id = g.created_by
		LEFT JOIN gap_analysis ga ON ga.gap_id = g.gap_id
		LEFT JOIN regulation_clause rc ON rc.clause_id = ga.clause_id
		WHERE ($1::smallint IS NULL OR g.site_id = $1::smallint)
		  AND ($2::smallint IS NULL OR g.category_id = $2::smallint)
		  AND ($3::text = '' OR g.workflow_status::text = $3::text)
		GROUP BY g.gap_id, r.legal_number, r.title, s.site_code, s.site_name, c.category_code, c.category_name, u.full_name
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
			&item.CreatedByName, &item.CreatedAt); err != nil {
			return nil, err
		}
		if item.TotalApplicable > 0 {
			item.Pct100 = float64(item.Count100) / float64(item.TotalApplicable) * 100
			item.Pct50 = float64(item.Count50) / float64(item.TotalApplicable) * 100
			item.Pct0 = float64(item.Count0) / float64(item.TotalApplicable) * 100
		}
		out = append(out, item)
	}
	return out, rows.Err()
}

func (s *Store) GetGapDocumentDetail(ctx context.Context, gapID int) (*GapDocumentDetail, error) {
	var d GapDocumentDetail
	err := s.Pool.QueryRow(ctx, `
		SELECT g.gap_id, g.gap_no, g.regulation_id, r.legal_number, r.title,
		       g.site_id, s.site_code, s.site_name,
		       g.category_id, c.category_code, c.category_name,
		       g.workflow_status::text, g.revision_no, g.effective_date,
		       0, 0, 0, 0, 0, u.full_name, g.created_at
		FROM gap_document g
		JOIN regulation r ON r.regulation_id = g.regulation_id
		JOIN site s ON s.site_id = g.site_id
		JOIN category c ON c.category_id = g.category_id
		JOIN users u ON u.user_id = g.created_by
		WHERE g.gap_id = $1`, gapID).Scan(
		&d.GapID, &d.GapNo, &d.RegulationID, &d.LegalNumber, &d.RegulationTitle,
		&d.SiteID, &d.SiteCode, &d.SiteName,
		&d.CategoryID, &d.CategoryCode, &d.CategoryName,
		&d.WorkflowStatus, &d.RevisionNo, &d.EffectiveDate,
		&d.TotalClauses, &d.TotalApplicable, &d.Count100, &d.Count50, &d.Count0,
		&d.CreatedByName, &d.CreatedAt)
	if err != nil {
		return nil, err
	}
	d.Clauses = []GapAnalysisRow{}

	rows, err := s.Pool.Query(ctx, `
		SELECT ga.gap_analysis_id, ga.gap_id, ga.clause_id, rc.sort_order,
		       COALESCE(rc.chapter,''), rc.clause_no, COALESCE(rc.clause_title,''), rc.requirement_text, rc.is_info,
		       ga.is_applicable, ga.dept_in_control_id, COALESCE(d.department_code,''), COALESCE(d.department_name,''),
		       ga.in_procedure, ga.in_practice, COALESCE(ga.actual_condition,''), COALESCE(ga.related_document,''),
		       ga.proposed_status::text, ga.status::text,
		       ap.action_plan_id, COALESCE(ap.plan_text,''), ap.pic_user_id, COALESCE(ap.pic_initials,''), ap.due_date,
		       COALESCE(uv.full_name,''), ga.verified_at, COALESCE(ga.verification_notes,'')
		FROM gap_analysis ga
		JOIN regulation_clause rc ON rc.clause_id = ga.clause_id
		LEFT JOIN department d ON d.department_id = ga.dept_in_control_id
		LEFT JOIN action_plan ap ON ap.gap_analysis_id = ga.gap_analysis_id
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
		if err := rows.Scan(&row.GapAnalysisID, &row.GapID, &row.ClauseID, &row.SortOrder,
			&row.Chapter, &row.ClauseNo, &row.ClauseTitle, &row.RequirementText, &row.IsInfo,
			&row.IsApplicable, &row.DeptInControlID, &row.DeptInControlCode, &row.DeptInControlName,
			&row.InProcedure, &row.InPractice, &row.ActualCondition, &row.RelatedDocument,
			&row.ProposedStatus, &row.Status,
			&row.ActionPlanID, &row.ActionPlanText, &row.PICUserID, &row.PICInitials, &row.DueDate,
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

		// Co-depts
		coRows, coErr := s.Pool.Query(ctx, `
			SELECT gco.department_id, d.department_code
			FROM gap_analysis_co_dept gco
			JOIN department d ON d.department_id = gco.department_id
			WHERE gco.gap_analysis_id = $1`, row.GapAnalysisID)
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

	return &d, rows.Err()
}

type UpdateGapAnalysisItemReq struct {
	GapAnalysisID   int64      `json:"gapAnalysisId"`
	IsApplicable    bool       `json:"isApplicable"`
	DeptInControlID *int       `json:"deptInControlId"`
	CoDeptIDs       []int      `json:"coDeptIds"`
	InProcedure     *bool      `json:"inProcedure"`
	InPractice      *bool      `json:"inPractice"`
	ActualCondition string     `json:"actualCondition"`
	RelatedDocument string     `json:"relatedDocument"`
	ActionPlanText  string     `json:"actionPlanText"`
	PICUserID       *int       `json:"picUserId"`
	PICInitials     string     `json:"picInitials"`
	DueDate         *time.Time `json:"dueDate"`
}

func (s *Store) SaveGapAnalysisDraft(ctx context.Context, actorUserID int, gapID int, items []UpdateGapAnalysisItemReq) error {
	return s.WithTx(ctx, actorUserID, func(tx pgx.Tx) error {
		for _, item := range items {
			// Calculate proposed status per URS 008A rule:
			// in_procedure & in_practice = 100; neither = 0; one = 50.
			var proposedStatus *string
			if item.InProcedure != nil && item.InPractice != nil {
				var p string
				if *item.InProcedure && *item.InPractice {
					p = "100"
				} else if !*item.InProcedure && !*item.InPractice {
					p = "0"
				} else {
					p = "50"
				}
				proposedStatus = &p
			}

			_, err := tx.Exec(ctx, `
				UPDATE gap_analysis
				SET is_applicable = $2, dept_in_control_id = $3,
				    in_procedure = $4, in_practice = $5,
				    actual_condition = NULLIF($6,''), related_document = NULLIF($7,''),
				    proposed_status = $8::gap_status,
				    status = CASE WHEN $2 = FALSE THEN 'NA'::gap_status ELSE status END
				WHERE gap_analysis_id = $1 AND gap_id = $9`,
				item.GapAnalysisID, item.IsApplicable, item.DeptInControlID,
				item.InProcedure, item.InPractice, item.ActualCondition, item.RelatedDocument,
				proposedStatus, gapID)
			if err != nil {
				return fmt.Errorf("update gap analysis %d: %w", item.GapAnalysisID, err)
			}

			// Update co-depts
			_, _ = tx.Exec(ctx, `DELETE FROM gap_analysis_co_dept WHERE gap_analysis_id = $1`, item.GapAnalysisID)
			for _, coDeptID := range item.CoDeptIDs {
				_, _ = tx.Exec(ctx, `
					INSERT INTO gap_analysis_co_dept (gap_analysis_id, department_id)
					VALUES ($1, $2) ON CONFLICT DO NOTHING`, item.GapAnalysisID, coDeptID)
			}

			// Action plan update if provided
			if item.ActionPlanText != "" && item.PICUserID != nil && item.DueDate != nil {
				_, err = tx.Exec(ctx, `
					INSERT INTO action_plan (gap_analysis_id, plan_text, pic_user_id, pic_initials, due_date)
					VALUES ($1, $2, $3, NULLIF($4,''), $5)
					ON CONFLICT (gap_analysis_id) DO UPDATE
					SET plan_text = EXCLUDED.plan_text, pic_user_id = EXCLUDED.pic_user_id,
					    pic_initials = EXCLUDED.pic_initials, due_date = EXCLUDED.due_date`,
					item.GapAnalysisID, item.ActionPlanText, *item.PICUserID, item.PICInitials, *item.DueDate)
				if err != nil {
					return fmt.Errorf("upsert action plan for ga %d: %w", item.GapAnalysisID, err)
				}
			}
		}
		return nil
	})
}

func (s *Store) SubmitGapToSupervisor(ctx context.Context, actorUserID int, gapID int) error {
	return s.WithTx(ctx, actorUserID, func(tx pgx.Tx) error {
		_, err := tx.Exec(ctx, `
			UPDATE gap_document
			SET workflow_status = 'SUPERVISOR_VERIFICATION', submitted_at = now()
			WHERE gap_id = $1 AND workflow_status IN ('DRAFT', 'ACTION_PLAN')`, gapID)
		return err
	})
}

type VerifyClauseReq struct {
	GapAnalysisID int64  `json:"gapAnalysisId"`
	Status        string `json:"status"` // '100', '50', '0', 'NA'
	Notes         string `json:"notes"`
}

func (s *Store) VerifyGapSupervisor(ctx context.Context, actorUserID int, gapID int, returnDraft bool, returnNotes string, clauses []VerifyClauseReq) error {
	return s.WithTx(ctx, actorUserID, func(tx pgx.Tx) error {
		if returnDraft {
			_, err := tx.Exec(ctx, `
				UPDATE gap_document
				SET workflow_status = 'DRAFT'
				WHERE gap_id = $1`, gapID)
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

		// Check gap doc details (category, site, cycle)
		var catID, siteID, cycle int
		var reqQA bool
		err := tx.QueryRow(ctx, `
			SELECT g.category_id, g.site_id, g.approval_cycle, c.requires_qa_manager
			FROM gap_document g
			JOIN category c ON c.category_id = g.category_id
			WHERE g.gap_id = $1`, gapID).Scan(&catID, &siteID, &cycle, &reqQA)
		if err != nil {
			return err
		}

		// Next workflow status: APPROVAL_STAGE1
		_, err = tx.Exec(ctx, `
			UPDATE gap_document
			SET workflow_status = 'APPROVAL_STAGE1'
			WHERE gap_id = $1`, gapID)
		if err != nil {
			return err
		}

		// Setup Approval Stage 1 steps:
		// Step 1: Manager Area for all involved departments
		// Step 2: Co Gap Manager
		// Step 3: QA Manager (site) (skipped if HSE)
		// Step 4: QO Head
		deptRows, err := tx.Query(ctx, `
			SELECT DISTINCT d.department_id, u.user_id
			FROM gap_analysis ga
			JOIN department d ON d.department_id = ga.dept_in_control_id
			JOIN users u ON u.department_id = d.department_id AND u.site_id = $2
			JOIN role r ON r.role_id = u.role_id AND r.role_code = 'MANAGER_AREA'
			WHERE ga.gap_id = $1 AND ga.is_applicable AND u.is_active = TRUE`, gapID, siteID)
		if err == nil {
			for deptRows.Next() {
				var dID, uID int
				if deptRows.Scan(&dID, &uID) == nil {
					var roleID int
					_ = tx.QueryRow(ctx, `SELECT role_id FROM role WHERE role_code = 'MANAGER_AREA'`).Scan(&roleID)
					_, _ = tx.Exec(ctx, `
						INSERT INTO approval (gap_id, stage, cycle_no, step_seq, role_id, department_id, assigned_user_id, result)
						VALUES ($1, 'STAGE1', $2, 1, $3, $4, $5, 'PENDING')
						ON CONFLICT DO NOTHING`, gapID, cycle, roleID, dID, uID)
				}
			}
			deptRows.Close()
		}

		// Step 2: Co Gap Manager
		var coGapMgrID, coGapRoleID int
		err = tx.QueryRow(ctx, `
			SELECT u.user_id, r.role_id FROM users u
			JOIN role r ON r.role_id = u.role_id
			WHERE r.role_code = 'CO_GAP_MANAGER' AND u.is_active = TRUE LIMIT 1`).Scan(&coGapMgrID, &coGapRoleID)
		if err == nil {
			_, _ = tx.Exec(ctx, `
				INSERT INTO approval (gap_id, stage, cycle_no, step_seq, role_id, assigned_user_id, result)
				VALUES ($1, 'STAGE1', $2, 2, $3, $4, 'PENDING')
				ON CONFLICT DO NOTHING`, gapID, cycle, coGapRoleID, coGapMgrID)
		}

		// Step 3: QA Manager (site)
		var qaMgrID, qaRoleID int
		err = tx.QueryRow(ctx, `
			SELECT u.user_id, r.role_id FROM users u
			JOIN role r ON r.role_id = u.role_id
			WHERE r.role_code = 'QA_MANAGER' AND u.site_id = $1 AND u.is_active = TRUE LIMIT 1`, siteID).Scan(&qaMgrID, &qaRoleID)
		if err == nil {
			qaResult := "PENDING"
			if !reqQA {
				qaResult = "SKIPPED" // HSE only requires Co Gap Manager per WI
			}
			_, _ = tx.Exec(ctx, `
				INSERT INTO approval (gap_id, stage, cycle_no, step_seq, role_id, assigned_user_id, result)
				VALUES ($1, 'STAGE1', $2, 3, $3, $4, $5::approval_result)
				ON CONFLICT DO NOTHING`, gapID, cycle, qaRoleID, qaMgrID, qaResult)
		}

		// Step 4: QO Head
		var qoHeadID, qoRoleID int
		err = tx.QueryRow(ctx, `
			SELECT u.user_id, r.role_id FROM users u
			JOIN role r ON r.role_id = u.role_id
			WHERE r.role_code = 'QO_HEAD' AND u.is_active = TRUE LIMIT 1`).Scan(&qoHeadID, &qoRoleID)
		if err == nil {
			_, _ = tx.Exec(ctx, `
				INSERT INTO approval (gap_id, stage, cycle_no, step_seq, role_id, assigned_user_id, result)
				VALUES ($1, 'STAGE1', $2, 4, $3, $4, 'PENDING')
				ON CONFLICT DO NOTHING`, gapID, cycle, qoRoleID, qoHeadID)
		}

		_ = hasBelow100
		return nil
	})
}
