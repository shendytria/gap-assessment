package store

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
)

type ClauseInput struct {
	SortOrder       int    `json:"sortOrder"`
	Chapter         string `json:"chapter"`
	ClauseNo        string `json:"clauseNo"`
	ClauseTitle     string `json:"clauseTitle"`
	RequirementText string `json:"requirementText"`
	IsInfo          bool   `json:"isInfo"`
}

type CreateRegulationReq struct {
	CategoryID           int           `json:"categoryId"`
	RegulationType       string        `json:"regulationType"` // optional; defaults to auto/CHAPTER_ARTICLE
	DocStatus            string        `json:"docStatus"`      // NEW, REVISION
	RevisionNo           int           `json:"revisionNo"`     // 00, 01, 04, ...
	LegalNumber          string        `json:"legalNumber"`
	Title                string        `json:"title"`
	PublishedDate        *time.Time    `json:"publishedDate"`
	PreviousRegulationID *int          `json:"previousRegulationId"`
	PdfFilePath          string        `json:"pdfFilePath"`
	PdfSha256            string        `json:"pdfSha256"`
	ReadMode             string        `json:"readMode"` // AUTO, MANUAL
	SiteIDs              []int         `json:"siteIds"`  // CKR, PLG, PLM (creates gap doc per site)
	Clauses              []ClauseInput `json:"clauses"`
}

type RegulationCreatedResult struct {
	RegulationID int      `json:"regulationId"`
	GapIDs       []int    `json:"gapIds"`
	GapNos       []string `json:"gapNos"`
}

type RegulationItem struct {
	ID                   int        `json:"id"`
	CategoryID           int        `json:"categoryId"`
	CategoryCode         string     `json:"categoryCode"`
	CategoryName         string     `json:"categoryName"`
	RegulationType       string     `json:"regulationType"`
	DocStatus            string     `json:"docStatus"`
	LegalNumber          string     `json:"legalNumber"`
	Title                string     `json:"title"`
	PublishedDate        *time.Time `json:"publishedDate"`
	PdfFilePath          string     `json:"pdfFilePath"`
	ReadMode             string     `json:"readMode"`
	UploadedByName       string     `json:"uploadedByName"`
	ClauseCount          int        `json:"clauseCount"`
	MaxRevisionNo        int        `json:"maxRevisionNo"`
	CreatedAt            time.Time  `json:"createdAt"`
}

type ClauseItem struct {
	ID              int64     `json:"id"`
	RegulationID    int       `json:"regulationId"`
	SortOrder       int       `json:"sortOrder"`
	Chapter         string    `json:"chapter"`
	ClauseNo        string    `json:"clauseNo"`
	ClauseTitle     string    `json:"clauseTitle"`
	RequirementText string    `json:"requirementText"`
	IsInfo          bool      `json:"isInfo"`
	Source          string    `json:"source"`
	CreatedAt       time.Time `json:"createdAt"`
}

func (s *Store) CreateRegulationWithGapDocs(ctx context.Context, actorUserID int, req CreateRegulationReq) (*RegulationCreatedResult, error) {
	if len(req.SiteIDs) == 0 {
		return nil, fmt.Errorf("at least one site must be selected")
	}
	if len(req.Clauses) == 0 {
		return nil, fmt.Errorf("at least one clause is required")
	}

	// Default regulationType automatically when omitted from the simplified UI
	regType := strings.TrimSpace(req.RegulationType)
	if regType == "" {
		regType = "CHAPTER_ARTICLE"
		for _, c := range req.Clauses {
			if !strings.HasPrefix(strings.ToLower(strings.TrimSpace(c.ClauseNo)), "pasal") {
				regType = "NUMBERED_STANDARD"
				break
			}
		}
	}

	baseRev := req.RevisionNo
	if baseRev < 0 {
		baseRev = 0
	}
	if baseRev > 99 {
		baseRev = 99
	}

	res := &RegulationCreatedResult{}

	err := s.WithTx(ctx, actorUserID, func(tx pgx.Tx) error {
		// Auto-detect existing regulation with the same title in DB so revision number increments automatically
		var hasExistingTitle bool
		var dbMaxRev int
		var matchedPrevRegID *int
		_ = tx.QueryRow(ctx, `
			SELECT EXISTS (
			    SELECT 1 FROM regulation WHERE lower(btrim(title)) = lower(btrim($1))
			),
			COALESCE((
			    SELECT MAX(gd.revision_no)
			    FROM regulation r
			    LEFT JOIN gap_document gd ON gd.regulation_id = r.regulation_id
			    WHERE lower(btrim(r.title)) = lower(btrim($1))
			), 0)::int,
			(
			    SELECT r.regulation_id
			    FROM regulation r
			    LEFT JOIN gap_document gd ON gd.regulation_id = r.regulation_id
			    WHERE lower(btrim(r.title)) = lower(btrim($1))
			    ORDER BY COALESCE(gd.revision_no, 0) DESC, r.regulation_id DESC
			    LIMIT 1
			)`, req.Title).Scan(&hasExistingTitle, &dbMaxRev, &matchedPrevRegID)

		if hasExistingTitle {
			if req.PreviousRegulationID == nil && matchedPrevRegID != nil {
				req.PreviousRegulationID = matchedPrevRegID
			}
			req.DocStatus = "REVISION"
			if baseRev <= dbMaxRev {
				baseRev = dbMaxRev + 1
				if baseRev > 99 {
					baseRev = 99
				}
			}
		}

		// 1. Insert regulation
		var regID int
		err := tx.QueryRow(ctx, `
			INSERT INTO regulation (category_id, regulation_type, doc_status, legal_number, title,
			                        published_date, previous_regulation_id, pdf_file_path, pdf_sha256, read_mode, uploaded_by)
			VALUES ($1, $2::regulation_type, $3::document_status, $4, $5, $6, $7, $8, NULLIF($9,''), $10::clause_source, $11)
			RETURNING regulation_id`,
			req.CategoryID, regType, req.DocStatus, req.LegalNumber, req.Title,
			req.PublishedDate, req.PreviousRegulationID, req.PdfFilePath, req.PdfSha256, req.ReadMode, actorUserID).Scan(&regID)
		if err != nil {
			return fmt.Errorf("insert regulation: %w", err)
		}
		res.RegulationID = regID

		// 2. Insert regulation clauses
		type createdClause struct {
			id     int64
			isInfo bool
		}
		var createdClauses []createdClause

		for i, c := range req.Clauses {
			order := c.SortOrder
			if order <= 0 {
				order = i + 1
			}
			clauseNo := c.ClauseNo
			if clauseNo == "" {
				clauseNo = fmt.Sprintf("%d", order)
			}
			var cid int64
			err := tx.QueryRow(ctx, `
				INSERT INTO regulation_clause (regulation_id, sort_order, chapter, clause_no, clause_title, requirement_text, is_info, source)
				VALUES ($1, $2, NULLIF($3,''), $4, NULLIF($5,''), $6, $7, $8::clause_source)
				RETURNING clause_id`,
				regID, order, c.Chapter, clauseNo, c.ClauseTitle, c.RequirementText, c.IsInfo, req.ReadMode).Scan(&cid)
			if err != nil {
				return fmt.Errorf("insert clause %d (%s): %w", order, clauseNo, err)
			}
			createdClauses = append(createdClauses, createdClause{id: cid, isInfo: c.IsInfo})
		}

		currentYear := time.Now().Year()

		// 3. For each site, create a gap_document and registered master_list_item and gap_analysis rows
		for _, siteID := range req.SiteIDs {
			gapYear := currentYear
			var seqNo int
			revNo := baseRev
			var prevGapID *int

			// If revising a previous regulation (or same regulation title on the same site & category),
			// reuse its gap_year & seq_no, increment revision_no, and archive the superseded active gap document.
			if req.DocStatus == "REVISION" {
				var pID, pYear, pSeq, pRev int
				var pStatus string
				var errPrev error = pgx.ErrNoRows
				if req.PreviousRegulationID != nil {
					errPrev = tx.QueryRow(ctx, `
						SELECT gap_id, gap_year, seq_no, revision_no, workflow_status::text
						FROM gap_document
						WHERE regulation_id = $1 AND site_id = $2 AND category_id = $3
						ORDER BY revision_no DESC
						LIMIT 1`, *req.PreviousRegulationID, siteID, req.CategoryID).Scan(&pID, &pYear, &pSeq, &pRev, &pStatus)
				}
				if errPrev != nil {
					errPrev = tx.QueryRow(ctx, `
						SELECT gd.gap_id, gd.gap_year, gd.seq_no, gd.revision_no, gd.workflow_status::text
						FROM gap_document gd
						JOIN regulation r ON r.regulation_id = gd.regulation_id
						WHERE lower(btrim(r.title)) = lower(btrim($1)) AND gd.site_id = $2 AND gd.category_id = $3
						ORDER BY gd.revision_no DESC, gd.gap_id DESC
						LIMIT 1`, req.Title, siteID, req.CategoryID).Scan(&pID, &pYear, &pSeq, &pRev, &pStatus)
				}
				if errPrev == nil {
					prevGapID = &pID
					gapYear = pYear
					seqNo = pSeq
					if revNo <= pRev {
						revNo = pRev + 1
					}
					if revNo > 99 {
						revNo = 99
					}
					if pStatus != "ARCHIVED" {
						if _, errArch := tx.Exec(ctx, `UPDATE gap_document SET workflow_status = 'ARCHIVED' WHERE gap_id = $1`, pID); errArch != nil {
							return fmt.Errorf("archive previous gap doc: %w", errArch)
						}
						if _, errSkip := tx.Exec(ctx, `UPDATE approval SET result = 'SKIPPED' WHERE gap_id = $1 AND result = 'PENDING'`, pID); errSkip != nil {
							return fmt.Errorf("skip archived gap approvals: %w", errSkip)
						}
					}
				}
			}

			if seqNo == 0 {
				err := tx.QueryRow(ctx, `SELECT fn_next_gap_seq($1::smallint, $2::smallint)`, req.CategoryID, gapYear).Scan(&seqNo)
				if err != nil {
					return fmt.Errorf("generate gap seq: %w", err)
				}
			}

			var gapNo string
			err = tx.QueryRow(ctx, `SELECT fn_format_gap_no($1::smallint, $2::smallint, $3, $4::smallint)`,
				req.CategoryID, gapYear, seqNo, revNo).Scan(&gapNo)
			if err != nil {
				return fmt.Errorf("format gap no: %w", err)
			}

			// Insert gap_document
			var gapID int
			err = tx.QueryRow(ctx, `
				INSERT INTO gap_document (gap_no, regulation_id, site_id, category_id, gap_year, seq_no, revision_no, previous_gap_id, workflow_status, created_by)
				VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'DRAFT', $9)
				RETURNING gap_id`,
				gapNo, regID, siteID, req.CategoryID, gapYear, seqNo, revNo, prevGapID, actorUserID).Scan(&gapID)
			if err != nil {
				return fmt.Errorf("insert gap doc (%s): %w", gapNo, err)
			}

			res.GapIDs = append(res.GapIDs, gapID)
			res.GapNos = append(res.GapNos, gapNo)

			// Register in Master List (find or create current master_list_doc for this site & category)
			var mlDocID int
			err = tx.QueryRow(ctx, `
				SELECT master_list_doc_id FROM master_list_doc
				WHERE site_id = $1 AND category_id = $2 AND is_current = TRUE`,
				siteID, req.CategoryID).Scan(&mlDocID)
			if err != nil {
				// Create a master_list_doc if not exist yet
				var catCode string
				_ = tx.QueryRow(ctx, `SELECT category_code FROM category WHERE category_id = $1`, req.CategoryID).Scan(&catCode)
				listNo := fmt.Sprintf("%s-00", catCode)
				err = tx.QueryRow(ctx, `
					INSERT INTO master_list_doc (site_id, category_id, revision_no, list_no, issue_date, review_date, change_history, is_current, created_by)
					VALUES ($1, $2, 0, $3, CURRENT_DATE, CURRENT_DATE + INTERVAL '1 year', 'Dokumen Baru', TRUE, $4)
					ON CONFLICT (site_id, list_no) DO UPDATE SET is_current = TRUE
					RETURNING master_list_doc_id`,
					siteID, req.CategoryID, listNo, actorUserID).Scan(&mlDocID)
				if err != nil {
					return fmt.Errorf("ensure master list doc: %w", err)
				}
			}

			// Next item_no in master_list_doc
			var nextItemNo int
			_ = tx.QueryRow(ctx, `SELECT COALESCE(MAX(item_no), 0) + 1 FROM master_list_item WHERE master_list_doc_id = $1`, mlDocID).Scan(&nextItemNo)

			// Insert master_list_item
			_, err = tx.Exec(ctx, `
				INSERT INTO master_list_item (master_list_doc_id, item_no, legal_number, legal_title, published_date, need_gap_analysis, regulation_id, gap_id)
				VALUES ($1, $2, $3, $4, $5, TRUE, $6, $7)`,
				mlDocID, nextItemNo, req.LegalNumber, req.Title, req.PublishedDate, regID, gapID)
			if err != nil {
				return fmt.Errorf("insert master list item: %w", err)
			}

			// Insert change_note (007E)
			_, _ = tx.Exec(ctx, `
				INSERT INTO change_note (gap_id, new_count, changed_count, deleted_count, change_points, edited_by)
				VALUES ($1, $2, 0, 0, 'Dokumen baru', $3)`,
				gapID, len(createdClauses), actorUserID)

			// Insert gap_analysis row for each clause
			for _, cc := range createdClauses {
				var status *string
				var isApp bool = true
				if cc.isInfo {
					s := "NA"
					status = &s
					isApp = false
				}
				_, err = tx.Exec(ctx, `
					INSERT INTO gap_analysis (gap_id, clause_id, is_applicable, status)
					VALUES ($1, $2, $3, $4::gap_status)`,
					gapID, cc.id, isApp, status)
				if err != nil {
					return fmt.Errorf("insert gap analysis row (clause %d): %w", cc.id, err)
				}
			}
		}

		return nil
	})

	if err != nil {
		return nil, err
	}
	return res, nil
}

func (s *Store) ListRegulations(ctx context.Context, categoryID *int, search string) ([]RegulationItem, error) {
	query := `
		SELECT r.regulation_id, r.category_id, c.category_code, c.category_name,
		       r.regulation_type, r.doc_status, r.legal_number, r.title, r.published_date,
		       COALESCE(r.pdf_file_path, ''), r.read_mode, u.full_name,
		       COUNT(DISTINCT rc.clause_id)::int AS clause_count,
		       COALESCE(MAX(gd.revision_no), 0)::int AS max_revision_no,
		       r.created_at
		FROM regulation r
		JOIN category c ON c.category_id = r.category_id
		JOIN users u ON u.user_id = r.uploaded_by
		LEFT JOIN regulation_clause rc ON rc.regulation_id = r.regulation_id
		LEFT JOIN gap_document gd ON gd.regulation_id = r.regulation_id
		WHERE ($1::smallint IS NULL OR r.category_id = $1::smallint)
		  AND ($2::text = '' OR lower(r.legal_number) LIKE '%' || lower($2::text) || '%' OR lower(r.title) LIKE '%' || lower($2::text) || '%')
		GROUP BY r.regulation_id, c.category_code, c.category_name, u.full_name
		ORDER BY r.created_at DESC`
	rows, err := s.Pool.Query(ctx, query, categoryID, search)
	if err != nil {
		return []RegulationItem{}, err
	}
	defer rows.Close()
	out := []RegulationItem{}
	for rows.Next() {
		var item RegulationItem
		if err := rows.Scan(&item.ID, &item.CategoryID, &item.CategoryCode, &item.CategoryName,
			&item.RegulationType, &item.DocStatus, &item.LegalNumber, &item.Title, &item.PublishedDate,
			&item.PdfFilePath, &item.ReadMode, &item.UploadedByName, &item.ClauseCount, &item.MaxRevisionNo, &item.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, item)
	}
	return out, rows.Err()
}

func (s *Store) GetRegulationWithClauses(ctx context.Context, regID int) (*RegulationItem, []ClauseItem, error) {
	var item RegulationItem
	err := s.Pool.QueryRow(ctx, `
		SELECT r.regulation_id, r.category_id, c.category_code, c.category_name,
		       r.regulation_type, r.doc_status, r.legal_number, r.title, r.published_date,
		       COALESCE(r.pdf_file_path, ''), r.read_mode, u.full_name, 0,
		       COALESCE((SELECT MAX(revision_no) FROM gap_document WHERE regulation_id = r.regulation_id), 0)::int,
		       r.created_at
		FROM regulation r
		JOIN category c ON c.category_id = r.category_id
		JOIN users u ON u.user_id = r.uploaded_by
		WHERE r.regulation_id = $1`, regID).Scan(
		&item.ID, &item.CategoryID, &item.CategoryCode, &item.CategoryName,
		&item.RegulationType, &item.DocStatus, &item.LegalNumber, &item.Title, &item.PublishedDate,
		&item.PdfFilePath, &item.ReadMode, &item.UploadedByName, &item.ClauseCount, &item.MaxRevisionNo, &item.CreatedAt)
	if err != nil {
		return nil, nil, err
	}

	rows, err := s.Pool.Query(ctx, `
		SELECT clause_id, regulation_id, sort_order, COALESCE(chapter,''), clause_no,
		       COALESCE(clause_title,''), requirement_text, is_info, source, created_at
		FROM regulation_clause
		WHERE regulation_id = $1
		ORDER BY sort_order ASC`, regID)
	if err != nil {
		return nil, nil, err
	}
	defer rows.Close()
	clauses := []ClauseItem{}
	for rows.Next() {
		var c ClauseItem
		if err := rows.Scan(&c.ID, &c.RegulationID, &c.SortOrder, &c.Chapter, &c.ClauseNo,
			&c.ClauseTitle, &c.RequirementText, &c.IsInfo, &c.Source, &c.CreatedAt); err != nil {
			return nil, nil, err
		}
		clauses = append(clauses, c)
	}
	item.ClauseCount = len(clauses)
	return &item, clauses, rows.Err()
}
