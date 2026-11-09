package store

import (
	"context"
	"time"
)

type MasterListItemDTO struct {
	MasterListItemID  int        `json:"masterListItemId"`
	MasterListDocID   int        `json:"masterListDocId"`
	ListNo            string     `json:"listNo"`
	SiteID            int        `json:"siteId"`
	SiteCode          string     `json:"siteCode"`
	SiteName          string     `json:"siteName"`
	CategoryID        int        `json:"categoryId"`
	CategoryCode      string     `json:"categoryCode"`
	CategoryName      string     `json:"categoryName"`
	ItemNo            int        `json:"itemNo"`
	LegalNumber       string     `json:"legalNumber"`
	LegalTitle        string     `json:"legalTitle"`
	PublishedDate     *time.Time `json:"publishedDate"`
	NeedGapAnalysis   bool       `json:"needGapAnalysis"`
	InterestedParties []string   `json:"interestedParties"`
	RegulationID      *int       `json:"regulationId"`
	GapID             *int       `json:"gapId"`
	GapNo             string     `json:"gapNo"`
	GapWorkflowStatus string     `json:"gapWorkflowStatus"`
	FulfillmentStatus string     `json:"fulfillmentStatus"` // 'Open', 'On Progress', 'Closed'
	CompliancePct100  float64    `json:"compliancePct100"`
	CreatedAt         time.Time  `json:"createdAt"`
}

func (s *Store) ListMasterList(ctx context.Context, siteID, categoryID, year *int, search string) ([]MasterListItemDTO, error) {
	query := `
		SELECT mli.master_list_item_id, mli.master_list_doc_id, mld.list_no,
		       mld.site_id, s.site_code, s.site_name,
		       mld.category_id, c.category_code, c.category_name,
		       mli.item_no, mli.legal_number, mli.legal_title, mli.published_date,
		       mli.need_gap_analysis, mli.regulation_id, mli.gap_id,
		       COALESCE(g.gap_no,''), COALESCE(g.workflow_status::text,''),
		       mli.created_at
		FROM master_list_item mli
		JOIN master_list_doc mld ON mld.master_list_doc_id = mli.master_list_doc_id
		JOIN site s ON s.site_id = mld.site_id
		JOIN category c ON c.category_id = mld.category_id
		LEFT JOIN gap_document g ON g.gap_id = mli.gap_id
		WHERE ($1::smallint IS NULL OR mld.site_id = $1::smallint)
		  AND ($2::smallint IS NULL OR mld.category_id = $2::smallint)
		  AND ($3::int IS NULL OR EXTRACT(YEAR FROM mld.issue_date)::int = $3::int)
		  AND ($4::text = '' OR lower(mli.legal_number) LIKE '%' || lower($4::text) || '%' OR lower(mli.legal_title) LIKE '%' || lower($4::text) || '%')
		ORDER BY mld.site_id, mld.category_id, mli.item_no ASC`
	rows, err := s.Pool.Query(ctx, query, siteID, categoryID, year, search)
	if err != nil {
		return []MasterListItemDTO{}, err
	}

	out := []MasterListItemDTO{}
	for rows.Next() {
		var item MasterListItemDTO
		if err := rows.Scan(&item.MasterListItemID, &item.MasterListDocID, &item.ListNo,
			&item.SiteID, &item.SiteCode, &item.SiteName,
			&item.CategoryID, &item.CategoryCode, &item.CategoryName,
			&item.ItemNo, &item.LegalNumber, &item.LegalTitle, &item.PublishedDate,
			&item.NeedGapAnalysis, &item.RegulationID, &item.GapID,
			&item.GapNo, &item.GapWorkflowStatus, &item.CreatedAt); err != nil {
			rows.Close()
			return out, err
		}
		item.InterestedParties = []string{}

		if !item.NeedGapAnalysis {
			item.FulfillmentStatus = "Closed"
		} else if item.GapID == nil || item.GapWorkflowStatus == "" || item.GapWorkflowStatus == "DRAFT" {
			item.FulfillmentStatus = "Open"
		} else if item.GapWorkflowStatus == "CLOSED" || item.GapWorkflowStatus == "ARCHIVED" {
			item.FulfillmentStatus = "Closed"
		} else {
			item.FulfillmentStatus = "On Progress"
		}

		out = append(out, item)
	}
	rows.Close()

	// Fill compliance and interested parties after main rows are closed
	for i := range out {
		if out[i].GapID != nil {
			var totalApp, c100 int
			_ = s.Pool.QueryRow(ctx, `
				SELECT COUNT(CASE WHEN ga.is_applicable AND NOT rc.is_info THEN 1 END)::int,
				       COUNT(CASE WHEN ga.is_applicable AND NOT rc.is_info AND ga.status = '100' THEN 1 END)::int
				FROM gap_analysis ga
				JOIN regulation_clause rc ON rc.clause_id = ga.clause_id
				WHERE ga.gap_id = $1`, *out[i].GapID).Scan(&totalApp, &c100)
			if totalApp > 0 {
				out[i].CompliancePct100 = float64(c100) / float64(totalApp) * 100
			}
		}

		depRows, depErr := s.Pool.Query(ctx, `
			SELECT d.department_code
			FROM master_list_item_department mlid
			JOIN department d ON d.department_id = mlid.department_id
			WHERE mlid.master_list_item_id = $1`, out[i].MasterListItemID)
		if depErr == nil {
			for depRows.Next() {
				var code string
				if depRows.Scan(&code) == nil {
					out[i].InterestedParties = append(out[i].InterestedParties, code)
				}
			}
			depRows.Close()
		}
	}

	return out, nil
}
