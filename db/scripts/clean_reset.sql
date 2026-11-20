-- =============================================================================
-- GAP ASSESSMENT ONLINE - CLEAN DATABASE RESET (FRESH STATE)
-- =============================================================================
BEGIN;
SET search_path = gap, public;

-- 1. Disable append-only / anti-delete triggers temporarily for administrative cleanup
ALTER TABLE gap.log_history DISABLE TRIGGER ALL;
ALTER TABLE gap.users DISABLE TRIGGER ALL;
ALTER TABLE gap.department DISABLE TRIGGER ALL;

-- 2. Truncate all transaction data, user sessions, audit history, regulations, and custom records
TRUNCATE TABLE
    gap.log_history,
    gap.notification,
    gap.evidence,
    gap.action_plan_due_change,
    gap.action_plan,
    gap.gap_analysis_co_dept,
    gap.gap_analysis_dept,
    gap.gap_analysis,
    gap.approval,
    gap.change_note,
    gap.gap_document,
    gap.regulation_clause,
    gap.regulation,
    gap.master_list_item_department,
    gap.master_list_item,
    gap.master_list_doc,
    gap.delegation,
    gap.password_history,
    gap.user_session,
    gap.users,
    gap.department
CASCADE;

-- 3. Reset document numbering sequence
UPDATE gap.gap_no_sequence SET last_seq = 0 WHERE 1=1;

-- 4. Re-enable all security and audit triggers
ALTER TABLE gap.log_history ENABLE TRIGGER ALL;
ALTER TABLE gap.users ENABLE TRIGGER ALL;
ALTER TABLE gap.department ENABLE TRIGGER ALL;

-- 5. Grant CO_GAP_SUPERVISOR full access across all 11 modules
INSERT INTO gap.role_permission (role_id, module, can_view, can_edit, can_approve, can_download_pdf)
SELECT r.role_id, m.mod, TRUE, TRUE, TRUE, TRUE
FROM gap.role r
CROSS JOIN (
    VALUES
        ('DASHBOARD'),
        ('MASTER_LIST'),
        ('UPLOAD_REGULATION'),
        ('GAP_ANALYSIS'),
        ('DELEGATION'),
        ('APPROVAL_S1'),
        ('APPROVAL_S2'),
        ('OUTSTANDING_EXECUTION'),
        ('MONITORING'),
        ('AUDIT_TRAIL'),
        ('SETTING')
) AS m(mod)
WHERE r.role_code = 'CO_GAP_SUPERVISOR'
ON CONFLICT (role_id, module)
DO UPDATE SET can_view = TRUE, can_edit = TRUE, can_approve = TRUE, can_download_pdf = TRUE;

COMMIT;
