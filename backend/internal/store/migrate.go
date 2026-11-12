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
	}
	for _, stmt := range stmts {
		if _, err := s.Pool.Exec(ctx, stmt); err != nil {
			return err
		}
	}
	return nil
}
