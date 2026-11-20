package store

import "context"

// EnsureSchema applies idempotent column additions so an existing database stays in sync with application updates.
func (s *Store) EnsureSchema(ctx context.Context) error {
	stmts := []string{
		`ALTER TYPE gap.gap_workflow_status ADD VALUE IF NOT EXISTS 'STAFF_REVIEW' AFTER 'ACTION_PLAN'`,
		`ALTER TABLE gap.action_plan ADD COLUMN IF NOT EXISTS execution_status VARCHAR(40) NOT NULL DEFAULT 'IN_PROGRESS'`,
		`ALTER TABLE gap.action_plan_due_change ADD COLUMN IF NOT EXISTS verification_notes TEXT`,
		`ALTER TABLE gap.evidence ADD COLUMN IF NOT EXISTS evidence_type VARCHAR(20) NOT NULL DEFAULT 'FILE'`,
		`ALTER TABLE gap.evidence ADD COLUMN IF NOT EXISTS evidence_text TEXT`,
		`ALTER TABLE gap.evidence ADD COLUMN IF NOT EXISTS mime_type VARCHAR(100)`,
		`ALTER TABLE gap.evidence ADD COLUMN IF NOT EXISTS file_size BIGINT`,
		`ALTER TABLE gap.notification ADD COLUMN IF NOT EXISTS read_at TIMESTAMPTZ`,
		`UPDATE gap.approval a SET result = 'SKIPPED' FROM gap.gap_document g WHERE a.gap_id = g.gap_id AND g.workflow_status = 'ARCHIVED' AND a.result = 'PENDING'`,
		`CREATE OR REPLACE FUNCTION gap.fn_format_gap_no(p_category_id SMALLINT, p_year SMALLINT, p_site_id SMALLINT, p_seq INT, p_rev SMALLINT) RETURNS TEXT
		LANGUAGE sql STABLE AS $$
			SELECT 'GAP-' || c.category_code || '-' || lpad(p_year::text, 4, '0') || '-' || s.site_code || '-' || lpad(p_seq::text, 3, '0')
				   || '.' || lpad(p_rev::text, 2, '0')
			FROM gap.category c, gap.site s
			WHERE c.category_id = p_category_id AND s.site_id = p_site_id;
		$$`,
		`ALTER TABLE gap.gap_document DROP CONSTRAINT IF EXISTS ck_gap_no_format`,
		`ALTER TABLE gap.gap_document ADD CONSTRAINT ck_gap_no_format CHECK (gap_no ~ '^GAP-(QU|HE|SA|EN|MG|HS)-[0-9]{4}-(CKR|PLG|PLM)-[0-9]{3}\.[0-9]{2}$')`,
	}
	for _, stmt := range stmts {
		if _, err := s.Pool.Exec(ctx, stmt); err != nil {
			return err
		}
	}
	return nil
}
