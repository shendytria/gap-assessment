-- =============================================================================
-- GAP ASSESSMENT ONLINE - Seed data (jalankan SETELAH gap_assessment_online_ddl.sql)
-- Sumber : URS 002A/002B (role & hak akses), WI-QO-QS-1023.04 poin 2g (kode departemen)
-- Catatan: role & kategori sudah di-seed di file DDL.
--          User awal TIDAK di-seed di sini: password default (KCH12345) harus di-hash oleh aplikasi.
-- =============================================================================
BEGIN;
SET search_path = gap, public;

-- 1. Site -----------------------------------------------------------------------
INSERT INTO site (site_code, site_name) VALUES
    ('CKR', 'Cikarang'),
    ('PLG', 'Pulogadung'),
    ('PLM', 'Pulomas');

-- 2. Departemen (WI 2g) - sama untuk setiap site ---------------------------------
-- [ASSUMPTION] dikonfirmasi "sama" untuk CKR & PLG; PLM diperlakukan sama. Nonaktifkan lewat Setting jika ada yang tidak berlaku.
-- Kode "WH" di WI tertulis tanpa nama lengkap -> diisi "Warehouse".
CREATE TEMP TABLE _dept (code VARCHAR(20), name VARCHAR(150)) ON COMMIT DROP;
INSERT INTO _dept VALUES
    ('AD','Analytical Development'),
    ('BD','Business Development'),
    ('CP','Central Procurement'),
    ('FA','Finance Accounting'),
    ('WH','Warehouse'),
    ('GA','General Affair'),
    ('HR','Human Resources'),
    ('IM','Warehouse Incoming Material'),
    ('IT','Information Technology'),
    ('LG','Legal'),
    ('MK','Marketing'),
    ('RA','Regulatory Affair'),
    ('MD','Manufacturing Development'),
    ('PC','Production Planning Control & Inventory Control'),
    ('FD','Formulation Development'),
    ('PD','Packaging Development'),
    ('PR','Produksi'),
    ('TK','Engineering'),
    ('PG','Purchasing'),
    ('TS','Technical Services'),
    ('QA','Quality Assurance'),
    ('QC','Quality Control'),
    ('QS','Quality System'),
    ('QM','Quality Assurance Compliance'),
    ('MS','Management System');

INSERT INTO department (department_code, department_name, site_id)
SELECT d.code, d.name, s.site_id FROM _dept d CROSS JOIN site s;

-- 3. Hak akses role x modul (URS 002B) --------------------------------------------
-- PDF hanya boleh diunduh Co Gap Staff & Co Gap Supervisor (URS 010A); role lain view-only.
-- can_approve = berhak approve/reject pada modul approval tsb (atau electronic review Master List).
CREATE TEMP TABLE _perm (role_code TEXT, module TEXT, v BOOL, e BOOL, a BOOL, pdf BOOL) ON COMMIT DROP;
INSERT INTO _perm VALUES
 -- Co Gap Staff
 ('CO_GAP_STAFF','DASHBOARD',            TRUE, FALSE, FALSE, TRUE),
 ('CO_GAP_STAFF','MASTER_LIST',          TRUE, FALSE, FALSE, TRUE),
 ('CO_GAP_STAFF','UPLOAD_REGULATION',    TRUE, TRUE,  FALSE, FALSE),
 ('CO_GAP_STAFF','GAP_ANALYSIS',         TRUE, TRUE,  FALSE, FALSE),
 ('CO_GAP_STAFF','DELEGATION',           TRUE, TRUE,  FALSE, FALSE),
 ('CO_GAP_STAFF','AUDIT_TRAIL',          TRUE, FALSE, FALSE, TRUE),
 ('CO_GAP_STAFF','SETTING',              TRUE, FALSE, FALSE, FALSE),
 -- Co Gap Supervisor
 ('CO_GAP_SUPERVISOR','DASHBOARD',       TRUE, FALSE, FALSE, TRUE),
 ('CO_GAP_SUPERVISOR','MASTER_LIST',     TRUE, TRUE,  FALSE, TRUE),   -- review & finalize
 ('CO_GAP_SUPERVISOR','GAP_ANALYSIS',    TRUE, TRUE,  FALSE, FALSE),  -- verifikasi, status final, verifikasi perubahan due date
 ('CO_GAP_SUPERVISOR','DELEGATION',      TRUE, TRUE,  FALSE, FALSE),
 ('CO_GAP_SUPERVISOR','APPROVAL_S2',     TRUE, TRUE,  FALSE, FALSE),  -- verifikasi evidence (langkah awal Stage 2)
 ('CO_GAP_SUPERVISOR','MONITORING',      TRUE, TRUE,  FALSE, FALSE),
 ('CO_GAP_SUPERVISOR','AUDIT_TRAIL',     TRUE, FALSE, FALSE, TRUE),
 ('CO_GAP_SUPERVISOR','SETTING',         TRUE, TRUE,  FALSE, FALSE),  -- users, department, category & site, delegation
 -- PIC Area
 ('PIC_AREA','DASHBOARD',                TRUE, FALSE, FALSE, FALSE),
 ('PIC_AREA','MASTER_LIST',              TRUE, FALSE, FALSE, FALSE),
 ('PIC_AREA','GAP_ANALYSIS',             TRUE, TRUE,  FALSE, FALSE),  -- action plan, PIC, due date (dept sendiri)
 ('PIC_AREA','OUTSTANDING_EXECUTION',    TRUE, TRUE,  FALSE, FALSE),
 -- Manager Area
 ('MANAGER_AREA','DASHBOARD',            TRUE, FALSE, FALSE, FALSE),
 ('MANAGER_AREA','MASTER_LIST',          TRUE, FALSE, FALSE, FALSE),
 ('MANAGER_AREA','APPROVAL_S1',          TRUE, FALSE, TRUE,  FALSE),
 ('MANAGER_AREA','APPROVAL_S2',          TRUE, FALSE, TRUE,  FALSE),
 ('MANAGER_AREA','AUDIT_TRAIL',          TRUE, FALSE, FALSE, FALSE),
 -- Co Gap Manager
 ('CO_GAP_MANAGER','DASHBOARD',          TRUE, FALSE, FALSE, FALSE),
 ('CO_GAP_MANAGER','MASTER_LIST',        TRUE, FALSE, TRUE,  FALSE),  -- electronic review/approval
 ('CO_GAP_MANAGER','DELEGATION',         TRUE, FALSE, FALSE, FALSE),
 ('CO_GAP_MANAGER','APPROVAL_S1',        TRUE, FALSE, TRUE,  FALSE),
 ('CO_GAP_MANAGER','APPROVAL_S2',        TRUE, FALSE, TRUE,  FALSE),
 ('CO_GAP_MANAGER','AUDIT_TRAIL',        TRUE, FALSE, FALSE, FALSE),
 ('CO_GAP_MANAGER','SETTING',            TRUE, FALSE, FALSE, FALSE),
 -- QA Manager
 ('QA_MANAGER','DASHBOARD',              TRUE, FALSE, FALSE, FALSE),
 ('QA_MANAGER','MASTER_LIST',            TRUE, FALSE, FALSE, FALSE),
 ('QA_MANAGER','APPROVAL_S1',            TRUE, FALSE, TRUE,  FALSE),
 ('QA_MANAGER','APPROVAL_S2',            TRUE, FALSE, TRUE,  FALSE),
 ('QA_MANAGER','AUDIT_TRAIL',            TRUE, FALSE, FALSE, FALSE),
 -- QO Head (final approval Stage 1 saja)
 ('QO_HEAD','DASHBOARD',                 TRUE, FALSE, FALSE, FALSE),
 ('QO_HEAD','MASTER_LIST',               TRUE, FALSE, FALSE, FALSE),
 ('QO_HEAD','APPROVAL_S1',               TRUE, FALSE, TRUE,  FALSE),
 ('QO_HEAD','AUDIT_TRAIL',               TRUE, FALSE, FALSE, FALSE);

INSERT INTO role_permission (role_id, module, can_view, can_edit, can_approve, can_download_pdf)
SELECT r.role_id, p.module, p.v, p.e, p.a, p.pdf
FROM _perm p JOIN role r ON r.role_code = p.role_code;

COMMIT;
