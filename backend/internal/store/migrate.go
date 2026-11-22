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
		`CREATE OR REPLACE FUNCTION gap.fn_audit_row() RETURNS trigger LANGUAGE plpgsql AS $$
		DECLARE
			v_user      INT  := NULLIF(current_setting('app.user_id', true), '')::INT;
			v_obo       INT  := NULLIF(current_setting('app.on_behalf_of', true), '')::INT;
			v_act       gap.audit_activity := TG_ARGV[0]::gap.audit_activity;
			v_new       JSONB;
			v_old       JSONB;
			v_row       JSONB;
			v_id        TEXT;
			v_gap       INT;
			v_site      SMALLINT;
			v_action    gap.audit_action;
			v_desc      TEXT;
			v_gap_no    TEXT;
			v_clause_no TEXT;
			v_role_name TEXT;
			v_orig_name TEXT;
			v_del_name  TEXT;
			v_obo_name  TEXT;
			v_stage_lbl TEXT;
		BEGIN
			IF TG_OP <> 'DELETE' THEN v_new := to_jsonb(NEW) - 'password_hash' - 'updated_at'; END IF;
			IF TG_OP <> 'INSERT' THEN v_old := to_jsonb(OLD) - 'password_hash' - 'updated_at'; END IF;
			IF TG_TABLE_NAME = 'users' THEN
				IF v_new IS NOT NULL THEN v_new := v_new - 'password_changed_at' - 'must_change_password' - 'failed_login_count' - 'locked_until' - 'last_login_at'; END IF;
				IF v_old IS NOT NULL THEN v_old := v_old - 'password_changed_at' - 'must_change_password' - 'failed_login_count' - 'locked_until' - 'last_login_at'; END IF;
			END IF;
			v_row  := COALESCE(v_new, v_old);
			v_id   := v_row ->> TG_ARGV[1];
			v_gap  := NULLIF(v_row ->> 'gap_id', '')::INT;
			v_site := NULLIF(v_row ->> 'site_id', '')::SMALLINT;

			IF v_gap IS NULL AND TG_TABLE_NAME = 'action_plan' THEN
				SELECT ga.gap_id INTO v_gap
				FROM gap.gap_analysis ga
				WHERE ga.gap_analysis_id = NULLIF(v_row ->> 'gap_analysis_id', '')::BIGINT;
			ELSIF v_gap IS NULL AND TG_TABLE_NAME = 'evidence' THEN
				SELECT ga.gap_id INTO v_gap
				FROM gap.action_plan ap
				JOIN gap.gap_analysis ga ON ga.gap_analysis_id = ap.gap_analysis_id
				WHERE ap.action_plan_id = NULLIF(v_row ->> 'action_plan_id', '')::BIGINT;
			END IF;

			IF v_gap IS NOT NULL THEN
				SELECT gap_no, COALESCE(v_site, site_id) INTO v_gap_no, v_site
				FROM gap.gap_document WHERE gap_id = v_gap;
			END IF;

			IF v_site IS NULL AND TG_TABLE_NAME = 'master_list_item' THEN
				SELECT site_id INTO v_site
				FROM gap.master_list_doc
				WHERE master_list_doc_id = NULLIF(v_row ->> 'master_list_doc_id', '')::INT;
			END IF;
			IF v_site IS NULL AND v_user IS NOT NULL THEN
				SELECT site_id INTO v_site FROM gap.users WHERE user_id = v_user;
			END IF;

			IF v_obo IS NULL AND TG_TABLE_NAME = 'approval' THEN
				v_obo := NULLIF(v_row ->> 'on_behalf_of_user_id', '')::INT;
			END IF;
			IF TG_TABLE_NAME = 'approval' AND (v_row ->> 'stage') = 'STAGE2' THEN
				v_act := 'APPROVAL_STAGE2';
			END IF;

			v_action := CASE TG_OP WHEN 'INSERT' THEN 'ADD' WHEN 'DELETE' THEN 'DELETE' ELSE 'EDIT' END;
			IF TG_OP = 'UPDATE' AND v_old = v_new THEN RETURN NEW; END IF;

			IF TG_TABLE_NAME = 'approval' THEN
				SELECT role_name INTO v_role_name FROM gap.role WHERE role_id = NULLIF(v_row ->> 'role_id', '')::SMALLINT;
				v_stage_lbl := CASE (v_row ->> 'stage')
					WHEN 'STAGE1' THEN 'Stage 1'
					WHEN 'STAGE2' THEN 'Stage 2'
					ELSE COALESCE(v_row ->> 'stage', '')
				END;
				IF TG_OP = 'UPDATE' AND (v_new->>'result') = 'APPROVED' THEN
					v_action := 'APPROVE';
					v_desc := 'Approved ' || v_stage_lbl || COALESCE(' for ' || v_gap_no, '') || COALESCE(' as ' || v_role_name, '');
					IF COALESCE(v_new->>'notes', '') <> '' THEN
						v_desc := v_desc || ' - Notes: ' || (v_new->>'notes');
					END IF;
				ELSIF TG_OP = 'UPDATE' AND (v_new->>'result') = 'REJECTED' THEN
					v_action := 'REJECT';
					v_desc := 'Rejected ' || v_stage_lbl || COALESCE(' for ' || v_gap_no, '') || COALESCE(' as ' || v_role_name, '')
						   || ' - Reason: ' || COALESCE(v_new->>'notes', 'No reason specified');
				ELSE
					v_desc := 'Approval task (' || v_stage_lbl || COALESCE(' - ' || v_role_name, '') || ')' || COALESCE(' for ' || v_gap_no, '') || ' assigned';
				END IF;

			ELSIF TG_TABLE_NAME = 'action_plan' THEN
				SELECT rc.clause_no INTO v_clause_no
				FROM gap.gap_analysis ga
				JOIN gap.regulation_clause rc ON rc.clause_id = ga.clause_id
				WHERE ga.gap_analysis_id = NULLIF(v_row ->> 'gap_analysis_id', '')::BIGINT;
				IF TG_OP = 'UPDATE' THEN
					IF COALESCE(v_old->>'execution_status','') <> COALESCE(v_new->>'execution_status','') THEN
						v_desc := 'Action Plan' || COALESCE(' for Clause ' || v_clause_no, '') || COALESCE(' (' || v_gap_no || ')', '')
							   || ' status changed from ' || COALESCE(v_old->>'execution_status','-') || ' to ' || COALESCE(v_new->>'execution_status','-');
					ELSIF COALESCE(v_old->>'due_date','') <> COALESCE(v_new->>'due_date','') THEN
						v_desc := 'Action Plan' || COALESCE(' for Clause ' || v_clause_no, '') || COALESCE(' (' || v_gap_no || ')', '')
							   || ' due date changed from ' || COALESCE(v_old->>'due_date','-') || ' to ' || COALESCE(v_new->>'due_date','-');
					ELSIF COALESCE(v_old->>'progress_pct','') <> COALESCE(v_new->>'progress_pct','') THEN
						v_desc := 'Action Plan' || COALESCE(' for Clause ' || v_clause_no, '') || COALESCE(' (' || v_gap_no || ')', '')
							   || ' progress updated from ' || COALESCE(v_old->>'progress_pct','0') || '% to ' || COALESCE(v_new->>'progress_pct','0') || '%';
					ELSE
						v_desc := 'Action Plan' || COALESCE(' for Clause ' || v_clause_no, '') || COALESCE(' (' || v_gap_no || ')', '') || ' updated';
					END IF;
				ELSIF TG_OP = 'INSERT' THEN
					v_desc := 'Action Plan' || COALESCE(' for Clause ' || v_clause_no, '') || COALESCE(' (' || v_gap_no || ')', '') || ' created';
					IF COALESCE(BTRIM(v_new->>'plan_text'), '') <> '' THEN
						v_desc := v_desc || ': ' || left(BTRIM(v_new->>'plan_text'), 120);
					END IF;
				ELSE
					v_desc := 'Action Plan' || COALESCE(' for Clause ' || v_clause_no, '') || COALESCE(' (' || v_gap_no || ')', '') || ' deleted';
				END IF;

			ELSIF TG_TABLE_NAME = 'gap_document' THEN
				IF TG_OP = 'INSERT' THEN
					v_desc := 'Gap Document ' || COALESCE(v_gap_no, '') || ' created';
				ELSIF TG_OP = 'UPDATE' AND COALESCE(v_old->>'workflow_status','') <> COALESCE(v_new->>'workflow_status','') THEN
					v_desc := 'Gap Document ' || COALESCE(v_gap_no, '') || ' status changed from ' || (v_old->>'workflow_status') || ' to ' || (v_new->>'workflow_status');
				ELSE
					v_desc := 'Gap Document ' || COALESCE(v_gap_no, '') || ' updated';
				END IF;

			ELSIF TG_TABLE_NAME = 'delegation' THEN
				v_action := 'DELEGATION';
				SELECT full_name INTO v_orig_name FROM gap.users WHERE user_id = NULLIF(v_row ->> 'original_user_id', '')::INT;
				SELECT full_name INTO v_del_name  FROM gap.users WHERE user_id = NULLIF(v_row ->> 'delegate_user_id', '')::INT;
				IF TG_OP = 'INSERT' THEN
					v_desc := 'Delegation created: ' || COALESCE(v_del_name, 'Delegate') || ' on behalf of ' || COALESCE(v_orig_name, 'Approver');
				ELSIF TG_OP = 'UPDATE' AND (v_new->>'is_active') = 'false' THEN
					v_desc := 'Delegation revoked: ' || COALESCE(v_del_name, 'Delegate') || ' on behalf of ' || COALESCE(v_orig_name, 'Approver');
				ELSE
					v_desc := 'Delegation updated: ' || COALESCE(v_del_name, 'Delegate') || ' on behalf of ' || COALESCE(v_orig_name, 'Approver');
				END IF;

			ELSIF TG_TABLE_NAME = 'gap_analysis' THEN
				SELECT clause_no INTO v_clause_no FROM gap.regulation_clause WHERE clause_id = NULLIF(v_row ->> 'clause_id', '')::BIGINT;
				IF TG_OP = 'UPDATE' THEN
					IF COALESCE(v_old->>'status','') <> COALESCE(v_new->>'status','') THEN
						v_desc := 'Clause ' || COALESCE(v_clause_no, '') || COALESCE(' (' || v_gap_no || ')', '')
							   || ' compliance status changed from ' || COALESCE(v_old->>'status','-') || ' to ' || COALESCE(v_new->>'status','-');
					ELSE
						v_desc := 'Gap evaluation for Clause ' || COALESCE(v_clause_no, '') || COALESCE(' (' || v_gap_no || ')', '') || ' updated';
					END IF;
				ELSIF TG_OP = 'INSERT' THEN
					v_desc := 'Gap evaluation for Clause ' || COALESCE(v_clause_no, '') || COALESCE(' (' || v_gap_no || ')', '') || ' initialized';
				ELSE
					v_desc := 'Gap evaluation for Clause ' || COALESCE(v_clause_no, '') || COALESCE(' (' || v_gap_no || ')', '') || ' deleted';
				END IF;

			ELSIF TG_TABLE_NAME = 'evidence' THEN
				IF TG_OP = 'INSERT' THEN
					v_desc := 'Evidence uploaded' || COALESCE(' (' || v_gap_no || ')', '') || ': ' || COALESCE(NULLIF(v_new->>'file_name',''), NULLIF(v_new->>'evidence_text',''), 'document');
				ELSE
					v_desc := 'Evidence record' || COALESCE(' (' || v_gap_no || ')', '') || ' updated';
				END IF;

			ELSIF TG_TABLE_NAME = 'regulation' THEN
				IF TG_OP = 'INSERT' THEN
					v_desc := 'Regulation registered: ' || COALESCE(v_new->>'legal_number', '') || ' - ' || COALESCE(v_new->>'title', '');
				ELSE
					v_desc := 'Regulation ' || COALESCE(v_row->>'legal_number', '') || ' updated';
				END IF;

			ELSIF TG_TABLE_NAME = 'regulation_clause' THEN
				IF TG_OP = 'INSERT' THEN
					v_desc := 'Regulation Clause ' || COALESCE(v_new->>'clause_no', '') || ' added';
				ELSIF TG_OP = 'DELETE' THEN
					v_desc := 'Regulation Clause ' || COALESCE(v_old->>'clause_no', '') || ' deleted';
				ELSE
					v_desc := 'Regulation Clause ' || COALESCE(v_new->>'clause_no', '') || ' updated';
				END IF;

			ELSIF TG_TABLE_NAME = 'master_list_doc' THEN
				IF TG_OP = 'INSERT' THEN
					v_desc := 'Master List ' || COALESCE(v_new->>'list_no', '') || ' created';
				ELSE
					v_desc := 'Master List ' || COALESCE(v_row->>'list_no', '') || ' updated';
				END IF;

			ELSIF TG_TABLE_NAME = 'master_list_item' THEN
				IF TG_OP = 'INSERT' THEN
					v_desc := 'Master List entry added: ' || COALESCE(v_new->>'legal_number', '') || ' - ' || COALESCE(v_new->>'legal_title', '');
				ELSE
					v_desc := 'Master List entry updated: ' || COALESCE(v_row->>'legal_number', '') || ' - ' || COALESCE(v_row->>'legal_title', '');
				END IF;

			ELSIF TG_TABLE_NAME = 'users' THEN
				IF TG_OP = 'INSERT' THEN
					v_desc := 'User ' || COALESCE(v_new->>'full_name', '') || ' (' || COALESCE(v_new->>'username', '') || ') created';
				ELSIF TG_OP = 'UPDATE' AND (v_old->>'is_active') = 'true' AND (v_new->>'is_active') = 'false' THEN
					v_action := 'DEACTIVATE';
					v_desc := 'User ' || COALESCE(v_new->>'full_name', '') || ' (' || COALESCE(v_new->>'username', '') || ') deactivated';
				ELSIF TG_OP = 'UPDATE' AND (v_old->>'is_active') = 'false' AND (v_new->>'is_active') = 'true' THEN
					v_desc := 'User ' || COALESCE(v_new->>'full_name', '') || ' (' || COALESCE(v_new->>'username', '') || ') reactivated';
				ELSE
					v_desc := 'User ' || COALESCE(v_row->>'full_name', '') || ' (' || COALESCE(v_row->>'username', '') || ') updated';
				END IF;

			ELSIF TG_TABLE_NAME = 'department' THEN
				IF TG_OP = 'INSERT' THEN
					v_desc := 'Department ' || COALESCE(v_new->>'department_name', '') || ' (' || COALESCE(v_new->>'department_code', '') || ') created';
				ELSIF TG_OP = 'UPDATE' AND (v_old->>'is_active') = 'true' AND (v_new->>'is_active') = 'false' THEN
					v_action := 'DEACTIVATE';
					v_desc := 'Department ' || COALESCE(v_new->>'department_name', '') || ' (' || COALESCE(v_new->>'department_code', '') || ') deactivated';
				ELSIF TG_OP = 'UPDATE' AND (v_old->>'is_active') = 'false' AND (v_new->>'is_active') = 'true' THEN
					v_desc := 'Department ' || COALESCE(v_new->>'department_name', '') || ' (' || COALESCE(v_new->>'department_code', '') || ') reactivated';
				ELSE
					v_desc := 'Department ' || COALESCE(v_row->>'department_name', '') || ' (' || COALESCE(v_row->>'department_code', '') || ') updated';
				END IF;

			ELSIF TG_TABLE_NAME = 'category' THEN
				v_desc := 'Category ' || COALESCE(v_row->>'category_name', '') || ' (' || COALESCE(v_row->>'category_code', '') || ') ' || CASE TG_OP WHEN 'INSERT' THEN 'created' ELSE 'updated' END;

			ELSIF TG_TABLE_NAME = 'site' THEN
				v_desc := 'Site ' || COALESCE(v_row->>'site_name', '') || ' (' || COALESCE(v_row->>'site_code', '') || ') ' || CASE TG_OP WHEN 'INSERT' THEN 'created' ELSE 'updated' END;

			ELSE
				v_desc := initcap(replace(TG_TABLE_NAME, '_', ' ')) || ' ' || CASE TG_OP WHEN 'INSERT' THEN 'created' WHEN 'DELETE' THEN 'deleted' ELSE 'updated' END;
			END IF;

			IF v_obo IS NOT NULL THEN
				SELECT full_name INTO v_obo_name FROM gap.users WHERE user_id = v_obo;
				v_desc := v_desc || ' (on behalf of ' || COALESCE(v_obo_name, 'approver') || ')';
			END IF;

			INSERT INTO gap.log_history (user_id, username, action, activity, site_id, gap_id, entity_table, entity_id,
										 description, before_value, after_value, on_behalf_of_user_id, ip_address)
			VALUES (v_user, (SELECT username FROM gap.users WHERE user_id = v_user), v_action, v_act, v_site, v_gap, TG_TABLE_NAME, v_id,
					v_desc, v_old, v_new, v_obo, NULLIF(current_setting('app.ip', true), '')::INET);
			RETURN COALESCE(NEW, OLD);
		END $$`,
		`DROP TRIGGER IF EXISTS trg_audit_gap_doc ON gap.gap_document`,
		`CREATE TRIGGER trg_audit_gap_doc AFTER INSERT OR UPDATE OR DELETE ON gap.gap_document FOR EACH ROW EXECUTE FUNCTION gap.fn_audit_row('GAP_ANALYSIS_ACTION_PLAN','gap_id')`,
	}
	for _, stmt := range stmts {
		if _, err := s.Pool.Exec(ctx, stmt); err != nil {
			return err
		}
	}
	return nil
}
