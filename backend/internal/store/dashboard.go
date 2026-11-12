package store

import (
	"context"
	"strings"
	"time"
)

type ComplianceMetric struct {
	TotalApplicable int     `json:"totalApplicable"`
	Count100        int     `json:"count100"`
	Count50         int     `json:"count50"`
	Count0          int     `json:"count0"`
	Pct100          float64 `json:"pct100"`
	Pct50           float64 `json:"pct50"`
	Pct0            float64 `json:"pct0"`
}

type GroupedMetric struct {
	Key              string  `json:"key"`
	Label            string  `json:"label"`
	ComplianceMetric
}

type OutstandingGapTask struct {
	GapID           int        `json:"gapId"`
	GapNo           string     `json:"gapNo"`
	LegalNumber     string     `json:"legalNumber"`
	RegulationTitle string     `json:"regulationTitle"`
	SiteCode        string     `json:"siteCode"`
	CategoryCode    string     `json:"categoryCode"`
	WorkflowStatus  string     `json:"workflowStatus"`
	TaskType        string     `json:"taskType"` // "DRAFT" | "RETURNED_DRAFT" | "SUPERVISOR_VERIFICATION" | "ACTION_PLAN"
	ReturnNotes     string     `json:"returnNotes"`
	ReturnedByName  string     `json:"returnedByName"`
	ReturnedAt      *time.Time `json:"returnedAt"`
	SubmittedAt     *time.Time `json:"submittedAt"`
	UpdatedAt       time.Time  `json:"updatedAt"`
}

type DashboardSummary struct {
	OverallCompliance          ComplianceMetric     `json:"overallCompliance"`
	ActiveRegulations          int                  `json:"activeRegulations"`
	PendingApprovals           int                  `json:"pendingApprovals"`
	OverdueActionPlans         int                  `json:"overdueActionPlans"`
	BySite                     []GroupedMetric      `json:"bySite"`
	ByCategory                 []GroupedMetric      `json:"byCategory"`
	UserPendingApprovals       []ApprovalTask       `json:"userPendingApprovals"`
	UserOutstandingPlans       []ActionPlanItem     `json:"userOutstandingPlans"`
	UserOutstandingDocs        []OutstandingGapTask `json:"userOutstandingDocs"`
	UserExecutionVerifications []ActionPlanItem     `json:"userExecutionVerifications"`
}

func (s *Store) GetDashboardData(ctx context.Context, userID int, siteID, categoryID *int) (*DashboardSummary, error) {
	d := &DashboardSummary{
		BySite:                     []GroupedMetric{},
		ByCategory:                 []GroupedMetric{},
		UserPendingApprovals:       []ApprovalTask{},
		UserOutstandingPlans:       []ActionPlanItem{},
		UserOutstandingDocs:        []OutstandingGapTask{},
		UserExecutionVerifications: []ActionPlanItem{},
	}

	// Overall compliance
	err := s.Pool.QueryRow(ctx, `
		SELECT COUNT(CASE WHEN ga.is_applicable AND NOT rc.is_info THEN 1 END)::int,
		       COUNT(CASE WHEN ga.is_applicable AND NOT rc.is_info AND ga.status = '100' THEN 1 END)::int,
		       COUNT(CASE WHEN ga.is_applicable AND NOT rc.is_info AND ga.status = '50' THEN 1 END)::int,
		       COUNT(CASE WHEN ga.is_applicable AND NOT rc.is_info AND ga.status = '0' THEN 1 END)::int
		FROM gap_analysis ga
		JOIN gap_document g ON g.gap_id = ga.gap_id
		JOIN regulation_clause rc ON rc.clause_id = ga.clause_id
		WHERE ($1::smallint IS NULL OR g.site_id = $1::smallint)
		  AND ($2::smallint IS NULL OR g.category_id = $2::smallint)
		  AND g.workflow_status <> 'ARCHIVED'`, siteID, categoryID).Scan(
		&d.OverallCompliance.TotalApplicable,
		&d.OverallCompliance.Count100,
		&d.OverallCompliance.Count50,
		&d.OverallCompliance.Count0)
	if err == nil && d.OverallCompliance.TotalApplicable > 0 {
		tot := float64(d.OverallCompliance.TotalApplicable)
		d.OverallCompliance.Pct100 = float64(d.OverallCompliance.Count100) / tot * 100
		d.OverallCompliance.Pct50 = float64(d.OverallCompliance.Count50) / tot * 100
		d.OverallCompliance.Pct0 = float64(d.OverallCompliance.Count0) / tot * 100
	}

	// Active regulations count
	_ = s.Pool.QueryRow(ctx, `
		SELECT COUNT(DISTINCT g.gap_id)::int
		FROM gap_document g
		WHERE ($1::smallint IS NULL OR g.site_id = $1::smallint)
		  AND ($2::smallint IS NULL OR g.category_id = $2::smallint)
		  AND g.workflow_status NOT IN ('CLOSED', 'ARCHIVED')`, siteID, categoryID).Scan(&d.ActiveRegulations)

	// Overdue action plans count
	_ = s.Pool.QueryRow(ctx, `
		SELECT COUNT(ap.action_plan_id)::int
		FROM action_plan ap
		JOIN gap_analysis ga ON ga.gap_analysis_id = ap.gap_analysis_id
		JOIN gap_document g ON g.gap_id = ga.gap_id
		WHERE ap.close_date IS NULL AND ap.due_date < CURRENT_DATE
		  AND ($1::smallint IS NULL OR g.site_id = $1::smallint)
		  AND ($2::smallint IS NULL OR g.category_id = $2::smallint)`, siteID, categoryID).Scan(&d.OverdueActionPlans)

	// Pending approvals for user
	apprs, _ := s.ListApprovals(ctx, userID, true)
	d.UserPendingApprovals = apprs
	d.PendingApprovals = len(apprs)

	// Outstanding plans & workflow tasks for user
	actorUser, _ := s.UserByID(ctx, userID)
	plans, _ := s.ListOutstandingActionPlans(ctx, actorUser, &userID, nil, siteID)
	d.UserOutstandingPlans = plans

	if actorUser != nil {
		switch actorUser.RoleCode {
		case "CO_GAP_STAFF":
			rows, err := s.Pool.Query(ctx, `
				SELECT g.gap_id, g.gap_no, r.legal_number, r.title, s.site_code, c.category_code,
				       g.workflow_status::text, COALESCE(g.return_notes,''), COALESCE(u_ret.full_name,''),
				       g.returned_at, g.submitted_at, g.updated_at
				FROM gap_document g
				JOIN regulation r ON r.regulation_id = g.regulation_id
				JOIN site s ON s.site_id = g.site_id
				JOIN category c ON c.category_id = g.category_id
				LEFT JOIN users u_ret ON u_ret.user_id = g.returned_by
				WHERE g.workflow_status IN ('DRAFT', 'STAFF_REVIEW')
				  AND ($1::smallint IS NULL OR g.site_id = $1::smallint)
				  AND ($2::smallint IS NULL OR g.category_id = $2::smallint)
				ORDER BY (g.workflow_status = 'STAFF_REVIEW') DESC,
				         (g.returned_at IS NOT NULL OR COALESCE(g.return_notes,'') <> '') DESC,
				         COALESCE(g.submitted_at, g.returned_at, g.updated_at) DESC`, siteID, categoryID)
			if err == nil {
				for rows.Next() {
					var it OutstandingGapTask
					if rows.Scan(&it.GapID, &it.GapNo, &it.LegalNumber, &it.RegulationTitle, &it.SiteCode, &it.CategoryCode,
						&it.WorkflowStatus, &it.ReturnNotes, &it.ReturnedByName,
						&it.ReturnedAt, &it.SubmittedAt, &it.UpdatedAt) == nil {
						if it.WorkflowStatus == "STAFF_REVIEW" {
							it.TaskType = "STAFF_REVIEW"
						} else if it.ReturnedAt != nil || strings.TrimSpace(it.ReturnNotes) != "" {
							it.TaskType = "RETURNED_DRAFT"
						} else {
							it.TaskType = "DRAFT"
						}
						d.UserOutstandingDocs = append(d.UserOutstandingDocs, it)
					}
				}
				rows.Close()
			}
		case "CO_GAP_SUPERVISOR":
			rows, err := s.Pool.Query(ctx, `
				SELECT g.gap_id, g.gap_no, r.legal_number, r.title, s.site_code, c.category_code,
				       g.workflow_status::text, COALESCE(g.return_notes,''), COALESCE(u_ret.full_name,''),
				       g.returned_at, g.submitted_at, g.updated_at
				FROM gap_document g
				JOIN regulation r ON r.regulation_id = g.regulation_id
				JOIN site s ON s.site_id = g.site_id
				JOIN category c ON c.category_id = g.category_id
				LEFT JOIN users u_ret ON u_ret.user_id = g.returned_by
				WHERE g.workflow_status = 'SUPERVISOR_VERIFICATION'
				  AND ($1::smallint IS NULL OR g.site_id = $1::smallint)
				  AND ($2::smallint IS NULL OR g.category_id = $2::smallint)
				ORDER BY COALESCE(g.submitted_at, g.updated_at) DESC`, siteID, categoryID)
			if err == nil {
				for rows.Next() {
					var it OutstandingGapTask
					if rows.Scan(&it.GapID, &it.GapNo, &it.LegalNumber, &it.RegulationTitle, &it.SiteCode, &it.CategoryCode,
						&it.WorkflowStatus, &it.ReturnNotes, &it.ReturnedByName,
						&it.ReturnedAt, &it.SubmittedAt, &it.UpdatedAt) == nil {
						it.TaskType = "SUPERVISOR_VERIFICATION"
						d.UserOutstandingDocs = append(d.UserOutstandingDocs, it)
					}
				}
				rows.Close()
			}

			allExec, errExec := s.ListOutstandingActionPlans(ctx, actorUser, nil, nil, siteID)
			if errExec == nil {
				for _, item := range allExec {
					if item.ExecutionStatus == "PENDING_VERIFICATION" || item.PendingDueChange != nil {
						d.UserExecutionVerifications = append(d.UserExecutionVerifications, item)
					}
				}
			}
		case "PIC_AREA":
			rows, err := s.Pool.Query(ctx, `
				SELECT DISTINCT g.gap_id, g.gap_no, r.legal_number, r.title, s.site_code, c.category_code,
				       g.workflow_status::text, COALESCE(g.return_notes,''), COALESCE(u_ret.full_name,''),
				       g.returned_at, g.submitted_at, g.updated_at
				FROM gap_document g
				JOIN regulation r ON r.regulation_id = g.regulation_id
				JOIN site s ON s.site_id = g.site_id
				JOIN category c ON c.category_id = g.category_id
				JOIN gap_analysis ga ON ga.gap_id = g.gap_id
				JOIN regulation_clause rc ON rc.clause_id = ga.clause_id
				LEFT JOIN action_plan ap ON ap.gap_analysis_id = ga.gap_analysis_id
				LEFT JOIN users u_ret ON u_ret.user_id = g.returned_by
				WHERE g.workflow_status = 'ACTION_PLAN'
				  AND ga.is_applicable = TRUE
				  AND rc.is_info = FALSE
				  AND (ga.in_procedure = FALSE OR ga.in_practice = FALSE)
				  AND ($1::smallint IS NULL OR g.site_id = $1::smallint)
				  AND ($2::smallint IS NULL OR g.category_id = $2::smallint)
				  AND ($5::smallint IS NULL OR g.site_id = $5::smallint)
				  AND ($3::int IS NULL OR ap.pic_user_id = $3::int
				       OR ga.dept_in_control_id = $4::int
				       OR ga.dept_in_control_all = TRUE
				       OR EXISTS (SELECT 1 FROM gap_analysis_dept gd WHERE gd.gap_analysis_id = ga.gap_analysis_id AND gd.department_id = $4::int))
				ORDER BY g.updated_at DESC`, siteID, categoryID, userID, actorUser.DepartmentID, actorUser.SiteID)
			if err == nil {
				for rows.Next() {
					var it OutstandingGapTask
					if rows.Scan(&it.GapID, &it.GapNo, &it.LegalNumber, &it.RegulationTitle, &it.SiteCode, &it.CategoryCode,
						&it.WorkflowStatus, &it.ReturnNotes, &it.ReturnedByName,
						&it.ReturnedAt, &it.SubmittedAt, &it.UpdatedAt) == nil {
						it.TaskType = "ACTION_PLAN"
						d.UserOutstandingDocs = append(d.UserOutstandingDocs, it)
					}
				}
				rows.Close()
			}
		}
	}

	// Breakdown by Site
	siteRows, err := s.Pool.Query(ctx, `
		SELECT s.site_code, s.site_name,
		       COUNT(CASE WHEN ga.is_applicable AND NOT rc.is_info THEN 1 END)::int,
		       COUNT(CASE WHEN ga.is_applicable AND NOT rc.is_info AND ga.status = '100' THEN 1 END)::int,
		       COUNT(CASE WHEN ga.is_applicable AND NOT rc.is_info AND ga.status = '50' THEN 1 END)::int,
		       COUNT(CASE WHEN ga.is_applicable AND NOT rc.is_info AND ga.status = '0' THEN 1 END)::int
		FROM site s
		LEFT JOIN gap_document g ON g.site_id = s.site_id AND g.workflow_status <> 'ARCHIVED'
		LEFT JOIN gap_analysis ga ON ga.gap_id = g.gap_id
		LEFT JOIN regulation_clause rc ON rc.clause_id = ga.clause_id
		GROUP BY s.site_code, s.site_name
		ORDER BY s.site_code`)
	if err == nil {
		defer siteRows.Close()
		for siteRows.Next() {
			var gm GroupedMetric
			if siteRows.Scan(&gm.Key, &gm.Label, &gm.TotalApplicable, &gm.Count100, &gm.Count50, &gm.Count0) == nil {
				if gm.TotalApplicable > 0 {
					tot := float64(gm.TotalApplicable)
					gm.Pct100 = float64(gm.Count100) / tot * 100
					gm.Pct50 = float64(gm.Count50) / tot * 100
					gm.Pct0 = float64(gm.Count0) / tot * 100
				}
				d.BySite = append(d.BySite, gm)
			}
		}
	}

	// Breakdown by Category
	catRows, err := s.Pool.Query(ctx, `
		SELECT c.category_code, c.category_name,
		       COUNT(CASE WHEN ga.is_applicable AND NOT rc.is_info THEN 1 END)::int,
		       COUNT(CASE WHEN ga.is_applicable AND NOT rc.is_info AND ga.status = '100' THEN 1 END)::int,
		       COUNT(CASE WHEN ga.is_applicable AND NOT rc.is_info AND ga.status = '50' THEN 1 END)::int,
		       COUNT(CASE WHEN ga.is_applicable AND NOT rc.is_info AND ga.status = '0' THEN 1 END)::int
		FROM category c
		LEFT JOIN gap_document g ON g.category_id = c.category_id AND g.workflow_status <> 'ARCHIVED'
		LEFT JOIN gap_analysis ga ON ga.gap_id = g.gap_id
		LEFT JOIN regulation_clause rc ON rc.clause_id = ga.clause_id
		GROUP BY c.category_code, c.category_name
		ORDER BY c.category_id`)
	if err == nil {
		defer catRows.Close()
		for catRows.Next() {
			var gm GroupedMetric
			if catRows.Scan(&gm.Key, &gm.Label, &gm.TotalApplicable, &gm.Count100, &gm.Count50, &gm.Count0) == nil {
				if gm.TotalApplicable > 0 {
					tot := float64(gm.TotalApplicable)
					gm.Pct100 = float64(gm.Count100) / tot * 100
					gm.Pct50 = float64(gm.Count50) / tot * 100
					gm.Pct0 = float64(gm.Count0) / tot * 100
				}
				d.ByCategory = append(d.ByCategory, gm)
			}
		}
	}

	return d, nil
}
