package store

import (
	"context"
	"time"
)

type AuditTrailItem struct {
	LogID          int64     `json:"logId"`
	LoggedAt       time.Time `json:"occurredAt"`
	UserID         *int      `json:"userId"`
	Username       string    `json:"username"`
	UserFullName   string    `json:"userFullName"`
	Action         string    `json:"action"`
	Activity       string    `json:"activity"`
	GapID          *int      `json:"gapId"`
	GapNo          string    `json:"gapNo"`
	EntityTable    string    `json:"entityTable"`
	EntityID       string    `json:"entityId"`
	Description    string    `json:"description"`
	SiteID         *int      `json:"siteId"`
	SiteCode       string    `json:"siteCode"`
	OnBehalfOfName string    `json:"onBehalfOfName"`
	IPAddress      string    `json:"ipAddress"`
}

func (s *Store) ListAuditTrail(ctx context.Context, siteID *int, activity, action *string, month, year *int, limit, offset int) ([]AuditTrailItem, int, error) {
	if limit <= 0 {
		limit = 50
	}

	whereClause := `
		WHERE ($1::smallint IS NULL OR lh.site_id = $1::smallint)
		  AND ($2::text = '' OR lh.activity::text = $2::text)
		  AND ($3::text = '' OR lh.action::text = $3::text)
		  AND ($4::int IS NULL OR EXTRACT(MONTH FROM lh.logged_at)::int = $4::int)
		  AND ($5::int IS NULL OR EXTRACT(YEAR FROM lh.logged_at)::int = $5::int)`

	actStr := ""
	if activity != nil {
		actStr = *activity
	}
	actionStr := ""
	if action != nil {
		actionStr = *action
	}

	var total int
	err := s.Pool.QueryRow(ctx, `SELECT COUNT(*)::int FROM log_history lh `+whereClause,
		siteID, actStr, actionStr, month, year).Scan(&total)
	if err != nil {
		return []AuditTrailItem{}, 0, err
	}

	query := `
		SELECT lh.log_id, lh.logged_at, lh.user_id, COALESCE(lh.username,''), COALESCE(u.full_name,''),
		       lh.action::text, lh.activity::text, lh.gap_id, COALESCE(g.gap_no,''),
		       COALESCE(lh.entity_table,''), COALESCE(lh.entity_id,''), lh.description,
		       lh.site_id, COALESCE(s.site_code,''), COALESCE(u_obo.full_name,''),
		       COALESCE(host(lh.ip_address),'')
		FROM log_history lh
		LEFT JOIN users u ON u.user_id = lh.user_id
		LEFT JOIN gap_document g ON g.gap_id = lh.gap_id
		LEFT JOIN site s ON s.site_id = lh.site_id
		LEFT JOIN users u_obo ON u_obo.user_id = lh.on_behalf_of_user_id
		` + whereClause + `
		ORDER BY lh.logged_at DESC
		LIMIT $6 OFFSET $7`

	rows, err := s.Pool.Query(ctx, query, siteID, actStr, actionStr, month, year, limit, offset)
	if err != nil {
		return []AuditTrailItem{}, 0, err
	}
	defer rows.Close()

	out := []AuditTrailItem{}
	for rows.Next() {
		var item AuditTrailItem
		if err := rows.Scan(&item.LogID, &item.LoggedAt, &item.UserID, &item.Username, &item.UserFullName,
			&item.Action, &item.Activity, &item.GapID, &item.GapNo,
			&item.EntityTable, &item.EntityID, &item.Description,
			&item.SiteID, &item.SiteCode, &item.OnBehalfOfName, &item.IPAddress); err != nil {
			return out, total, err
		}
		out = append(out, item)
	}
	return out, total, rows.Err()
}
