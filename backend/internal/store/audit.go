package store

import (
	"context"
	"encoding/json"
	"fmt"
	"regexp"
	"strings"
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

var legacyHashIDRe = regexp.MustCompile(`\s*#\d+`)

func jsonStrField(raw []byte, key string) string {
	if len(raw) == 0 {
		return ""
	}
	var m map[string]any
	if err := json.Unmarshal(raw, &m); err != nil {
		return ""
	}
	if v, ok := m[key]; ok && v != nil {
		return strings.TrimSpace(fmt.Sprintf("%v", v))
	}
	return ""
}

func formatAuditDescription(item AuditTrailItem, beforeRaw, afterRaw []byte, clauseNo string) string {
	desc := strings.TrimSpace(item.Description)
	if !strings.Contains(desc, "#") &&
		!strings.HasPrefix(desc, "INSERT ") &&
		!strings.HasPrefix(desc, "UPDATE ") &&
		!strings.HasPrefix(desc, "DELETE ") &&
		!strings.HasSuffix(desc, "created:") {
		return desc
	}

	pick := func(key string) string {
		if v := jsonStrField(afterRaw, key); v != "" {
			return v
		}
		return jsonStrField(beforeRaw, key)
	}

	verb := "updated"
	if item.Action == "ADD" || item.Action == "NEW" {
		verb = "created"
	} else if item.Action == "DELETE" {
		verb = "deleted"
	} else if item.Action == "DEACTIVATE" {
		verb = "deactivated"
	}

	gapSuffix := ""
	if item.GapNo != "" {
		gapSuffix = fmt.Sprintf(" (%s)", item.GapNo)
	}

	switch item.EntityTable {
	case "department":
		name := pick("department_name")
		code := pick("department_code")
		if jsonStrField(beforeRaw, "is_active") == "true" && jsonStrField(afterRaw, "is_active") == "false" {
			verb = "deactivated"
		} else if jsonStrField(beforeRaw, "is_active") == "false" && jsonStrField(afterRaw, "is_active") == "true" {
			verb = "reactivated"
		}
		if name != "" && code != "" {
			return fmt.Sprintf("Department %s (%s) %s", name, code, verb)
		}
		if name != "" {
			return fmt.Sprintf("Department %s %s", name, verb)
		}
		if code != "" {
			return fmt.Sprintf("Department %s %s", code, verb)
		}

	case "users":
		fullName := pick("full_name")
		username := pick("username")
		if jsonStrField(beforeRaw, "is_active") == "true" && jsonStrField(afterRaw, "is_active") == "false" {
			verb = "deactivated"
		} else if jsonStrField(beforeRaw, "is_active") == "false" && jsonStrField(afterRaw, "is_active") == "true" {
			verb = "reactivated"
		}
		if fullName != "" && username != "" {
			return fmt.Sprintf("User %s (%s) %s", fullName, username, verb)
		}
		if username != "" {
			return fmt.Sprintf("User %s %s", username, verb)
		}

	case "gap_analysis":
		cl := clauseNo
		if cl != "" {
			if strings.Contains(desc, "compliance status changed") {
				oldSt := jsonStrField(beforeRaw, "status")
				newSt := jsonStrField(afterRaw, "status")
				if oldSt == "" {
					oldSt = "-"
				}
				return fmt.Sprintf("Clause %s%s compliance status changed from %s to %s", cl, gapSuffix, oldSt, newSt)
			}
			return fmt.Sprintf("Gap evaluation for Clause %s%s %s", cl, gapSuffix, verb)
		}

	case "action_plan":
		clPart := ""
		if clauseNo != "" {
			clPart = " for Clause " + clauseNo
		}
		if item.Action == "ADD" {
			planText := pick("plan_text")
			if planText != "" {
				if len(planText) > 120 {
					planText = planText[:120] + "..."
				}
				return fmt.Sprintf("Action Plan%s%s created: %s", clPart, gapSuffix, planText)
			}
			return fmt.Sprintf("Action Plan%s%s created", clPart, gapSuffix)
		}
		return fmt.Sprintf("Action Plan%s%s %s", clPart, gapSuffix, verb)

	case "regulation":
		legal := pick("legal_number")
		title := pick("title")
		if legal != "" && title != "" {
			return fmt.Sprintf("Regulation %s - %s %s", legal, title, verb)
		}
		if legal != "" {
			return fmt.Sprintf("Regulation %s %s", legal, verb)
		}

	case "regulation_clause":
		cl := pick("clause_no")
		if cl != "" {
			return fmt.Sprintf("Regulation Clause %s %s", cl, verb)
		}

	case "master_list_doc":
		listNo := pick("list_no")
		if listNo != "" {
			return fmt.Sprintf("Master List %s %s", listNo, verb)
		}

	case "master_list_item":
		legal := pick("legal_number")
		title := pick("legal_title")
		if legal != "" && title != "" {
			return fmt.Sprintf("Master List entry %s - %s %s", legal, title, verb)
		}
		if legal != "" {
			return fmt.Sprintf("Master List entry %s %s", legal, verb)
		}

	case "gap_document":
		if item.GapNo != "" {
			return fmt.Sprintf("Gap Document %s %s", item.GapNo, verb)
		}
	}

	// Fallback: strip any remaining raw "#123" tokens cleanly
	cleaned := strings.TrimSpace(legacyHashIDRe.ReplaceAllString(desc, ""))
	return strings.Join(strings.Fields(cleaned), " ")
}

func (s *Store) ListAuditTrail(ctx context.Context, siteID *int, activity, action *string, month, year *int, limit, offset int) ([]AuditTrailItem, int, error) {
	if limit <= 0 {
		limit = 50
	}

	whereClause := `
		WHERE ($1::smallint IS NULL OR COALESCE(lh.site_id, g.site_id, NULLIF(COALESCE(lh.after_value, lh.before_value)->>'site_id','')::smallint, u.site_id) = $1::smallint)
		  AND (
		      $2::text = ''
		      OR ($2::text = 'SETTING' AND lh.activity::text LIKE 'SETTING_%')
		      OR ($2::text = 'GAP_ANALYSIS_ACTION_PLAN' AND (lh.activity::text = 'GAP_ANALYSIS_ACTION_PLAN' OR (lh.activity::text = 'MASTER_LIST' AND lh.entity_table = 'gap_document')))
		      OR lh.activity::text = $2::text
		  )
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
	err := s.Pool.QueryRow(ctx, `
		SELECT COUNT(*)::int
		FROM log_history lh
		LEFT JOIN gap_document g ON g.gap_id = lh.gap_id
		LEFT JOIN users u ON u.user_id = lh.user_id `+whereClause,
		siteID, actStr, actionStr, month, year).Scan(&total)
	if err != nil {
		return []AuditTrailItem{}, 0, err
	}

	query := `
		SELECT lh.log_id, lh.logged_at, lh.user_id, COALESCE(lh.username,''), COALESCE(u.full_name,''),
		       lh.action::text, lh.activity::text, lh.gap_id, COALESCE(g.gap_no,''),
		       COALESCE(lh.entity_table,''), COALESCE(lh.entity_id,''), lh.description,
		       COALESCE(lh.site_id, g.site_id, NULLIF(COALESCE(lh.after_value, lh.before_value)->>'site_id','')::smallint, u.site_id),
		       COALESCE(s.site_code, s_gap.site_code, s_json.site_code, s_usr.site_code, ''),
		       COALESCE(u_obo.full_name,''),
		       COALESCE(host(lh.ip_address),''),
		       lh.before_value, lh.after_value,
		       COALESCE(
		           CASE
		               WHEN lh.entity_table = 'gap_analysis' THEN (
		                   SELECT rc.clause_no FROM regulation_clause rc
		                   WHERE rc.clause_id = NULLIF(COALESCE(lh.after_value, lh.before_value)->>'clause_id','')::BIGINT
		               )
		               WHEN lh.entity_table = 'action_plan' THEN (
		                   SELECT rc.clause_no FROM gap_analysis ga
		                   JOIN regulation_clause rc ON rc.clause_id = ga.clause_id
		                   WHERE ga.gap_analysis_id = NULLIF(COALESCE(lh.after_value, lh.before_value)->>'gap_analysis_id','')::BIGINT
		               )
		               ELSE ''
		           END, ''
		       ) AS resolved_clause_no
		FROM log_history lh
		LEFT JOIN users u ON u.user_id = lh.user_id
		LEFT JOIN gap_document g ON g.gap_id = lh.gap_id
		LEFT JOIN site s ON s.site_id = lh.site_id
		LEFT JOIN site s_gap ON s_gap.site_id = g.site_id
		LEFT JOIN site s_json ON s_json.site_id = NULLIF(COALESCE(lh.after_value, lh.before_value)->>'site_id','')::smallint
		LEFT JOIN site s_usr ON s_usr.site_id = u.site_id
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
		var beforeRaw, afterRaw []byte
		var resolvedClauseNo string
		if err := rows.Scan(&item.LogID, &item.LoggedAt, &item.UserID, &item.Username, &item.UserFullName,
			&item.Action, &item.Activity, &item.GapID, &item.GapNo,
			&item.EntityTable, &item.EntityID, &item.Description,
			&item.SiteID, &item.SiteCode, &item.OnBehalfOfName, &item.IPAddress,
			&beforeRaw, &afterRaw, &resolvedClauseNo); err != nil {
			return out, total, err
		}
		item.Description = formatAuditDescription(item, beforeRaw, afterRaw, resolvedClauseNo)
		out = append(out, item)
	}
	return out, total, rows.Err()
}
