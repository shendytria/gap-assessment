package store

import (
	"context"
	"time"

	"github.com/jackc/pgx/v5"
)

type ActionPlanItem struct {
	ActionPlanID     int64      `json:"actionPlanId"`
	GapAnalysisID    int64      `json:"gapAnalysisId"`
	GapID            int        `json:"gapId"`
	GapNo            string     `json:"gapNo"`
	LegalNumber      string     `json:"legalNumber"`
	RegulationTitle  string     `json:"regulationTitle"`
	SiteCode         string     `json:"siteCode"`
	ClauseNo         string     `json:"clauseNo"`
	RequirementText  string     `json:"requirementText"`
	ActualCondition  string     `json:"actualCondition"`
	PlanText         string     `json:"planText"`
	PICUserID        int        `json:"picUserId"`
	PICName          string     `json:"picName"`
	PICInitials      string     `json:"picInitials"`
	DeptCode         string     `json:"deptCode"`
	CreateDate       time.Time  `json:"createDate"`
	DueDate          time.Time  `json:"dueDate"`
	ProgressPct      int        `json:"progressPct"`
	ProgressNotes    string     `json:"progressNotes"`
	CloseDate        *time.Time `json:"closeDate"`
	LeadTimeDays     *int       `json:"leadTimeDays"`
	OverdueDays      int        `json:"overdueDays"`
	MonitoringStatus string     `json:"monitoringStatus"` // 'Pending', 'On time', 'Overdue'
	VerifiedByName   string     `json:"verifiedByName"`
	VerifiedAt       *time.Time `json:"verifiedAt"`
	FulfillmentNotes string     `json:"fulfillmentNotes"`
	EvidenceCount    int        `json:"evidenceCount"`
	EvidenceFiles    []string   `json:"evidenceFiles"`
}

func (s *Store) ListOutstandingActionPlans(ctx context.Context, picUserID *int, deptID *int, siteID *int) ([]ActionPlanItem, error) {
	query := `
		SELECT ap.action_plan_id, ap.gap_analysis_id, g.gap_id, g.gap_no,
		       r.legal_number, r.title, s.site_code,
		       rc.clause_no, rc.requirement_text, COALESCE(ga.actual_condition,''),
		       ap.plan_text, ap.pic_user_id, u_pic.full_name, COALESCE(ap.pic_initials,''),
		       COALESCE(d.department_code,''),
		       ap.create_date, ap.due_date, ap.progress_pct, COALESCE(ap.progress_notes,''),
		       ap.close_date,
		       COALESCE(u_v.full_name,''), ap.verified_at, COALESCE(ap.fulfillment_notes,''),
		       COUNT(ev.evidence_id)::int AS evidence_count
		FROM action_plan ap
		JOIN gap_analysis ga ON ga.gap_analysis_id = ap.gap_analysis_id
		JOIN gap_document g ON g.gap_id = ga.gap_id
		JOIN regulation r ON r.regulation_id = g.regulation_id
		JOIN regulation_clause rc ON rc.clause_id = ga.clause_id
		JOIN site s ON s.site_id = g.site_id
		JOIN users u_pic ON u_pic.user_id = ap.pic_user_id
		LEFT JOIN department d ON d.department_id = ga.dept_in_control_id
		LEFT JOIN users u_v ON u_v.user_id = ap.verified_by
		LEFT JOIN evidence ev ON ev.action_plan_id = ap.action_plan_id AND ev.is_superseded = FALSE
		WHERE ($1::int IS NULL OR ap.pic_user_id = $1::int)
		  AND ($2::int IS NULL OR ga.dept_in_control_id = $2::int)
		  AND ($3::smallint IS NULL OR g.site_id = $3::smallint)
		  AND ap.close_date IS NULL
		GROUP BY ap.action_plan_id, ga.gap_analysis_id, g.gap_id, g.gap_no, r.legal_number, r.title,
		         s.site_code, rc.clause_no, rc.requirement_text, ga.actual_condition,
		         u_pic.full_name, d.department_code, u_v.full_name
		ORDER BY ap.due_date ASC`
	rows, err := s.Pool.Query(ctx, query, picUserID, deptID, siteID)
	if err != nil {
		return []ActionPlanItem{}, err
	}
	defer rows.Close()

	now := time.Now()
	today := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, time.UTC)

	out := []ActionPlanItem{}
	for rows.Next() {
		var item ActionPlanItem
		if err := rows.Scan(&item.ActionPlanID, &item.GapAnalysisID, &item.GapID, &item.GapNo,
			&item.LegalNumber, &item.RegulationTitle, &item.SiteCode,
			&item.ClauseNo, &item.RequirementText, &item.ActualCondition,
			&item.PlanText, &item.PICUserID, &item.PICName, &item.PICInitials,
			&item.DeptCode,
			&item.CreateDate, &item.DueDate, &item.ProgressPct, &item.ProgressNotes,
			&item.CloseDate,
			&item.VerifiedByName, &item.VerifiedAt, &item.FulfillmentNotes,
			&item.EvidenceCount); err != nil {
			return nil, err
		}

		// Calculate lead time and overdue status per URS 004B
		if item.CloseDate != nil {
			lt := int(item.CloseDate.Sub(item.CreateDate).Hours() / 24)
			item.LeadTimeDays = &lt
			if !item.CloseDate.After(item.DueDate) {
				item.MonitoringStatus = "On time"
			} else {
				item.MonitoringStatus = "Overdue"
			}
		} else {
			if today.After(item.DueDate) {
				item.OverdueDays = int(today.Sub(item.DueDate).Hours() / 24)
				item.MonitoringStatus = "Overdue"
			} else {
				item.MonitoringStatus = "Pending"
			}
		}

		out = append(out, item)
	}
	return out, rows.Err()
}

func (s *Store) ListActionPlansByGapID(ctx context.Context, gapID int) ([]ActionPlanItem, error) {
	query := `
		SELECT ap.action_plan_id, ap.gap_analysis_id, g.gap_id, g.gap_no,
		       r.legal_number, r.title, s.site_code,
		       rc.clause_no, rc.requirement_text, COALESCE(ga.actual_condition,''),
		       ap.plan_text, ap.pic_user_id, u_pic.full_name, COALESCE(ap.pic_initials,''),
		       COALESCE(d.department_code,''),
		       ap.create_date, ap.due_date, ap.progress_pct, COALESCE(ap.progress_notes,''),
		       ap.close_date,
		       COALESCE(u_v.full_name,''), ap.verified_at, COALESCE(ap.fulfillment_notes,''),
		       COUNT(ev.evidence_id)::int AS evidence_count
		FROM action_plan ap
		JOIN gap_analysis ga ON ga.gap_analysis_id = ap.gap_analysis_id
		JOIN gap_document g ON g.gap_id = ga.gap_id
		JOIN regulation r ON r.regulation_id = g.regulation_id
		JOIN regulation_clause rc ON rc.clause_id = ga.clause_id
		JOIN site s ON s.site_id = g.site_id
		JOIN users u_pic ON u_pic.user_id = ap.pic_user_id
		LEFT JOIN department d ON d.department_id = ga.dept_in_control_id
		LEFT JOIN users u_v ON u_v.user_id = ap.verified_by
		LEFT JOIN evidence ev ON ev.action_plan_id = ap.action_plan_id AND ev.is_superseded = FALSE
		WHERE g.gap_id = $1
		GROUP BY ap.action_plan_id, ga.gap_analysis_id, g.gap_id, g.gap_no, r.legal_number, r.title,
		         s.site_code, rc.clause_no, rc.requirement_text, ga.actual_condition,
		         u_pic.full_name, d.department_code, u_v.full_name, rc.sort_order
		ORDER BY rc.sort_order ASC`
	rows, err := s.Pool.Query(ctx, query, gapID)
	if err != nil {
		return []ActionPlanItem{}, err
	}
	defer rows.Close()

	now := time.Now()
	today := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, time.UTC)

	out := []ActionPlanItem{}
	for rows.Next() {
		var item ActionPlanItem
		if err := rows.Scan(&item.ActionPlanID, &item.GapAnalysisID, &item.GapID, &item.GapNo,
			&item.LegalNumber, &item.RegulationTitle, &item.SiteCode,
			&item.ClauseNo, &item.RequirementText, &item.ActualCondition,
			&item.PlanText, &item.PICUserID, &item.PICName, &item.PICInitials,
			&item.DeptCode,
			&item.CreateDate, &item.DueDate, &item.ProgressPct, &item.ProgressNotes,
			&item.CloseDate,
			&item.VerifiedByName, &item.VerifiedAt, &item.FulfillmentNotes,
			&item.EvidenceCount); err != nil {
			return nil, err
		}

		if item.CloseDate != nil {
			lt := int(item.CloseDate.Sub(item.CreateDate).Hours() / 24)
			item.LeadTimeDays = &lt
			if !item.CloseDate.After(item.DueDate) {
				item.MonitoringStatus = "On time"
			} else {
				item.MonitoringStatus = "Overdue"
			}
		} else {
			if today.After(item.DueDate) {
				item.OverdueDays = int(today.Sub(item.DueDate).Hours() / 24)
				item.MonitoringStatus = "Overdue"
			} else {
				item.MonitoringStatus = "Pending"
			}
		}

		out = append(out, item)
	}
	return out, rows.Err()
}

type UpdateActionPlanReq struct {
	ProgressPct      int    `json:"progressPct"`
	ProgressNotes    string `json:"progressNotes"`
	FulfillmentNotes string `json:"fulfillmentNotes"`
	EvidenceFileName string `json:"evidenceFileName"`
	EvidenceFilePath string `json:"evidenceFilePath"`
}

func (s *Store) UpdateActionPlan(ctx context.Context, actorUserID int, planID int64, req UpdateActionPlanReq) error {
	return s.WithTx(ctx, actorUserID, func(tx pgx.Tx) error {
		_, err := tx.Exec(ctx, `
			UPDATE action_plan
			SET progress_pct = $2, progress_notes = NULLIF($3,''), fulfillment_notes = NULLIF($4,'')
			WHERE action_plan_id = $1`,
			planID, req.ProgressPct, req.ProgressNotes, req.FulfillmentNotes)
		if err != nil {
			return err
		}

		if req.EvidenceFileName != "" && req.EvidenceFilePath != "" {
			_, err = tx.Exec(ctx, `
				INSERT INTO evidence (action_plan_id, file_name, file_path, uploaded_by)
				VALUES ($1, $2, $3, $4)`,
				planID, req.EvidenceFileName, req.EvidenceFilePath, actorUserID)
			if err != nil {
				return err
			}
		}
		return nil
	})
}
