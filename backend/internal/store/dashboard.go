package store

import (
	"context"
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

type DashboardSummary struct {
	OverallCompliance   ComplianceMetric  `json:"overallCompliance"`
	ActiveRegulations   int               `json:"activeRegulations"`
	PendingApprovals    int               `json:"pendingApprovals"`
	OverdueActionPlans  int               `json:"overdueActionPlans"`
	BySite              []GroupedMetric   `json:"bySite"`
	ByCategory          []GroupedMetric   `json:"byCategory"`
	UserPendingApprovals []ApprovalTask    `json:"userPendingApprovals"`
	UserOutstandingPlans []ActionPlanItem  `json:"userOutstandingPlans"`
}

func (s *Store) GetDashboardData(ctx context.Context, userID int, siteID, categoryID *int) (*DashboardSummary, error) {
	d := &DashboardSummary{
		BySite:               []GroupedMetric{},
		ByCategory:           []GroupedMetric{},
		UserPendingApprovals: []ApprovalTask{},
		UserOutstandingPlans: []ActionPlanItem{},
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

	// Outstanding plans for user
	plans, _ := s.ListOutstandingActionPlans(ctx, &userID, nil, siteID)
	d.UserOutstandingPlans = plans

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
