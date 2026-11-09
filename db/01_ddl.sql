-- =============================================================================
-- GAP ASSESSMENT ONLINE  -  Database schema (PostgreSQL 14+)
-- Source : URS Gap Assessment Online (Kalbe Consumer Health)
--          WI-QO-QS-1023.04 Panduan Penyusunan Gap Analysis Legal & Other Requirements Compliance
--          (format penomoran, Master List, rumus kepatuhan, aturan approval mengikuti WI)
-- Scope  : sites CKR / PLG / PLM
-- Notes  : * Asumsi yang belum ada di URS/WI ditandai  [ASSUMPTION]
--          * Audit trail (log_history) bersifat append-only (data integrity / ERES)
-- =============================================================================

BEGIN;

CREATE SCHEMA IF NOT EXISTS gap;
SET search_path = gap, public;

-- -----------------------------------------------------------------------------
-- 0. ENUM TYPES
-- -----------------------------------------------------------------------------
CREATE TYPE regulation_type    AS ENUM ('CHAPTER_ARTICLE', 'NUMBERED_STANDARD', 'INTERNAL_DOC');   -- 007A
CREATE TYPE document_status    AS ENUM ('NEW', 'REVISION');                                        -- 007A
CREATE TYPE clause_source      AS ENUM ('AUTO', 'MANUAL');                                         -- 007B / 007C
CREATE TYPE clause_change_type AS ENUM ('NEW', 'CHANGED', 'UNCHANGED', 'REQUIRES_CHECK');          -- 007D
CREATE TYPE gap_status         AS ENUM ('100', '50', '0', 'NA');                                   -- 008A (INFO ada di regulation_clause.is_info)
CREATE TYPE gap_workflow_status AS ENUM (
    'DRAFT',                    -- Co Gap Staff menyusun gap analysis
    'ACTION_PLAN',              -- PIC Area mengisi action plan (juga tujuan saat reject Stage 1)
    'SUPERVISOR_VERIFICATION',  -- Co Gap Supervisor verifikasi assessment (008C)
    'APPROVAL_STAGE1',          -- Manager Area > Co Gap Manager > QA Manager > QO Head (009A)
    'EXECUTION',                -- PIC Area menjalankan action plan + upload evidence (009B, juga tujuan saat reject Stage 2)
    'APPROVAL_STAGE2',          -- Supervisor verify > Manager Area > Co Gap Manager > QA Manager (009C)
    'CLOSED',                   -- Gap closure
    'ARCHIVED'                  -- Digantikan revisi berikutnya (version history)
);
CREATE TYPE approval_stage     AS ENUM ('MASTER_LIST', 'STAGE1', 'STAGE2');
CREATE TYPE approval_result    AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'SKIPPED');
CREATE TYPE audit_action       AS ENUM ('NEW','ADD','REVISE','EDIT','UPDATE','DELETE','DEACTIVATE','VERIFY','APPROVE','REJECT','DELEGATION','LOGIN','LOGOUT');  -- 004A
CREATE TYPE audit_activity     AS ENUM ('MASTER_LIST','UPLOAD_REGULATION','GAP_ANALYSIS_ACTION_PLAN','APPROVAL_STAGE1','APPROVAL_STAGE2',
                                        'SETTING_USERS','SETTING_DEPARTMENT','SETTING_CATEGORY_SITE','SETTING_DELEGATION','AUTH');
CREATE TYPE notif_status       AS ENUM ('QUEUED', 'SENT', 'FAILED');
CREATE TYPE due_change_status  AS ENUM ('REQUESTED', 'APPROVED', 'REJECTED');

-- -----------------------------------------------------------------------------
-- 1. MASTER DATA
-- -----------------------------------------------------------------------------
CREATE TABLE site (
    site_id     SMALLINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    site_code   VARCHAR(10)  NOT NULL UNIQUE,            -- CKR / PLG / PLM
    site_name   VARCHAR(100) NOT NULL,
    is_active   BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE TABLE category (
    category_id   SMALLINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    category_code VARCHAR(10)  NOT NULL UNIQUE,          -- QU / HE / SA / EN / MG / HS
    category_name VARCHAR(150) NOT NULL,
    requires_qa_manager BOOLEAN NOT NULL DEFAULT FALSE,  -- WI hal.4: kategori Quality/Halal/Manufacturing wajib disetujui QA Manager + Co Gap Manager; HSE cukup Co Gap Manager
    is_active     BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CONSTRAINT ck_category_code CHECK (category_code ~ '^[A-Z]{2}$')     -- WI 2a: AA = 2 huruf
);

-- Kategori sesuai WI (poin 2a): QU, HE, SA, EN, MG, HS
INSERT INTO category (category_code, category_name, requires_qa_manager) VALUES
    ('QU', 'Quality',       TRUE),
    ('HE', 'Health',        FALSE),
    ('SA', 'Safety',        FALSE),
    ('EN', 'Environment',   FALSE),
    ('MG', 'Manufacturing', TRUE),
    ('HS', 'Halal',         TRUE);

CREATE TABLE department (
    department_id   INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    department_code VARCHAR(20)  NOT NULL,
    department_name VARCHAR(150) NOT NULL,
    site_id         SMALLINT     NOT NULL REFERENCES site(site_id),
    is_active       BOOLEAN      NOT NULL DEFAULT TRUE,      -- 011B: tidak boleh DELETE, hanya deactivate
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CONSTRAINT uq_department_code_site UNIQUE (department_code, site_id)
);

CREATE TABLE role (
    role_id   SMALLINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    role_code VARCHAR(30) NOT NULL UNIQUE,
    role_name VARCHAR(60) NOT NULL
);

-- 002A: tujuh role aplikasi
INSERT INTO role (role_code, role_name) VALUES
    ('CO_GAP_STAFF',      'Co Gap Staff'),
    ('CO_GAP_SUPERVISOR', 'Co Gap Supervisor / Halal Mgmt Rep'),
    ('PIC_AREA',          'PIC Area'),
    ('MANAGER_AREA',      'Manager Area'),
    ('CO_GAP_MANAGER',    'Co Gap Manager'),
    ('QA_MANAGER',        'QA Manager'),
    ('QO_HEAD',           'QO Head');

-- Hak akses per role per modul (002B). Dipakai middleware otorisasi.
CREATE TABLE role_permission (
    role_id    SMALLINT    NOT NULL REFERENCES role(role_id),
    module     VARCHAR(40) NOT NULL,   -- DASHBOARD, MASTER_LIST, UPLOAD_REGULATION, GAP_ANALYSIS, DELEGATION, APPROVAL_S1, APPROVAL_S2, AUDIT_TRAIL, SETTING, ...
    can_view   BOOLEAN NOT NULL DEFAULT FALSE,
    can_edit   BOOLEAN NOT NULL DEFAULT FALSE,
    can_approve BOOLEAN NOT NULL DEFAULT FALSE,
    can_download_pdf BOOLEAN NOT NULL DEFAULT FALSE,
    PRIMARY KEY (role_id, module)
);

-- -----------------------------------------------------------------------------
-- 2. USERS & SESSION  (001A, 001B, 006A, 011A)
-- -----------------------------------------------------------------------------
CREATE TABLE users (
    user_id               INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    username              VARCHAR(50)  NOT NULL,
    full_name             VARCHAR(150) NOT NULL,
    email                 VARCHAR(150) NOT NULL,
    job_title             VARCHAR(100),
    role_id               SMALLINT     NOT NULL REFERENCES role(role_id),
    department_id         INT          REFERENCES department(department_id),
    site_id               SMALLINT     REFERENCES site(site_id),   -- [ASSUMPTION] 1 user = 1 site. Jika perlu multi-site, ganti dengan tabel user_site.
    initials              VARCHAR(10),                              -- inisial PIC (008B)
    password_hash         TEXT         NOT NULL,                    -- bcrypt/argon2, JANGAN simpan plaintext
    must_change_password  BOOLEAN      NOT NULL DEFAULT TRUE,       -- default password KCH12345 -> wajib ganti saat login pertama
    password_changed_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),      -- basis aturan ganti password 90 hari
    failed_login_count    SMALLINT     NOT NULL DEFAULT 0,
    locked_until          TIMESTAMPTZ,
    last_login_at         TIMESTAMPTZ,
    is_active             BOOLEAN      NOT NULL DEFAULT TRUE,       -- deactivate, bukan delete
    created_by            INT          REFERENCES users(user_id),
    created_at            TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at            TIMESTAMPTZ  NOT NULL DEFAULT now()
);
-- username unik (case-insensitive)
CREATE UNIQUE INDEX uq_users_username ON users (lower(username));
CREATE INDEX ix_users_role_site   ON users (role_id, site_id) WHERE is_active;
CREATE INDEX ix_users_department  ON users (department_id);

CREATE TABLE password_history (          -- mencegah pemakaian ulang password [ASSUMPTION: praktik GMP, tidak eksplisit di URS]
    password_history_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id       INT  NOT NULL REFERENCES users(user_id),
    password_hash TEXT NOT NULL,
    changed_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ix_password_history_user ON password_history (user_id, changed_at DESC);

CREATE TABLE user_session (              -- 001B: expire setelah 30 menit tidak aktif
    session_id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id          INT NOT NULL REFERENCES users(user_id),
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_activity_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at       TIMESTAMPTZ NOT NULL,                       -- last_activity_at + interval '30 minutes'
    ip_address       INET,
    revoked_at       TIMESTAMPTZ
);
CREATE INDEX ix_user_session_user    ON user_session (user_id);
CREATE INDEX ix_user_session_expires ON user_session (expires_at) WHERE revoked_at IS NULL;

-- -----------------------------------------------------------------------------
-- 3. REGULATION & CLAUSES  (007A - 007E)
-- -----------------------------------------------------------------------------
CREATE TABLE regulation (
    regulation_id        INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    category_id          SMALLINT     NOT NULL REFERENCES category(category_id),
    regulation_type      regulation_type NOT NULL,
    doc_status           document_status NOT NULL,
    legal_number         VARCHAR(150) NOT NULL,           -- lengkap dengan tahun/revisi; BUKAN unik (revisi memakai legal number yang sama)
    title                TEXT         NOT NULL,
    published_date       DATE,
    previous_regulation_id INT        REFERENCES regulation(regulation_id),   -- 007D
    pdf_file_path        TEXT         NOT NULL,
    pdf_sha256           CHAR(64),                        -- integritas file
    read_mode            clause_source NOT NULL DEFAULT 'AUTO',               -- AUTO = dibaca sistem, MANUAL = diinput manual (007C)
    uploaded_by          INT          NOT NULL REFERENCES users(user_id),
    created_at           TIMESTAMPTZ  NOT NULL DEFAULT now()
    -- previous_regulation_id boleh kosong walau REVISION, jika Staff tidak menemukan versi lama
);
CREATE INDEX ix_regulation_legal_number ON regulation (lower(legal_number));   -- rekomendasi versi sebelumnya (007D)
CREATE INDEX ix_regulation_category     ON regulation (category_id);

CREATE TABLE regulation_clause (
    clause_id        BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    regulation_id    INT  NOT NULL REFERENCES regulation(regulation_id) ON DELETE CASCADE,
    sort_order       INT  NOT NULL,
    chapter          VARCHAR(200),
    clause_no        VARCHAR(50)  NOT NULL,               -- level penomoran terendah, mis. 2.3.1
    clause_title     TEXT,                                -- boleh kosong
    requirement_text TEXT         NOT NULL,               -- bahasa asli dokumen
    is_info          BOOLEAN      NOT NULL DEFAULT FALSE, -- INFO: tanpa status/action plan, dikecualikan dari % compliance
    source           clause_source NOT NULL DEFAULT 'AUTO',
    created_at       TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CONSTRAINT uq_clause_order  UNIQUE (regulation_id, sort_order),
    CONSTRAINT uq_clause_number UNIQUE (regulation_id, clause_no)
);
CREATE INDEX ix_clause_regulation ON regulation_clause (regulation_id, sort_order);
-- pencarian kemiripan teks untuk perbandingan revisi (007D)
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX ix_clause_text_trgm ON regulation_clause USING gin (requirement_text gin_trgm_ops);

-- -----------------------------------------------------------------------------
-- 4. GAP DOCUMENT (1 regulasi x 1 site) & MASTER LIST
-- -----------------------------------------------------------------------------
-- Penomoran Gap No (WI poin 2a):   GAP-AA-BBBB-CCC.DD     contoh: GAP-QU-2026-001.00
--   AA   = kategori (QU/HE/SA/EN/MG/HS)
--   BBBB = tahun pertama kali gap dilakukan terhadap peraturan tsb (tetap sama pada revisi)
--   CCC  = running number dokumen gap pada kategori tsb di tahun gap dibuat (3 digit)
--   DD   = nomor revisi terhadap legal number yang sama; 00 jika baru
-- [ASSUMPTION] running number per (kategori, tahun) dipakai bersama semua site; tiap site mendapat nomor sendiri
--              karena gap dibuat terpisah per site (URS 007A). Konfirmasi jika numbering ingin per site.
CREATE TABLE gap_no_sequence (
    category_id SMALLINT NOT NULL REFERENCES category(category_id),
    gap_year    SMALLINT NOT NULL,
    last_seq    INT      NOT NULL DEFAULT 0 CHECK (last_seq BETWEEN 0 AND 999),
    PRIMARY KEY (category_id, gap_year)
);

-- Ambil running number berikutnya secara atomik (aman untuk akses bersamaan)
CREATE FUNCTION fn_next_gap_seq(p_category_id SMALLINT, p_year SMALLINT) RETURNS INT
LANGUAGE sql AS $$
    INSERT INTO gap_no_sequence (category_id, gap_year, last_seq) VALUES (p_category_id, p_year, 1)
    ON CONFLICT (category_id, gap_year) DO UPDATE SET last_seq = gap_no_sequence.last_seq + 1
    RETURNING last_seq;
$$;

CREATE FUNCTION fn_format_gap_no(p_category_id SMALLINT, p_year SMALLINT, p_seq INT, p_rev SMALLINT) RETURNS TEXT
LANGUAGE sql STABLE AS $$
    SELECT 'GAP-' || c.category_code || '-' || lpad(p_year::text, 4, '0') || '-' || lpad(p_seq::text, 3, '0')
           || '.' || lpad(p_rev::text, 2, '0')
    FROM category c WHERE c.category_id = p_category_id;
$$;

CREATE TABLE gap_document (
    gap_id           INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    gap_no           VARCHAR(30) NOT NULL UNIQUE,                -- GAP-QU-2026-001.00
    regulation_id    INT         NOT NULL REFERENCES regulation(regulation_id),
    site_id          SMALLINT    NOT NULL REFERENCES site(site_id),
    category_id      SMALLINT    NOT NULL REFERENCES category(category_id),
    gap_year         SMALLINT    NOT NULL,                       -- BBBB (tahun gap pertama; tidak berubah saat revisi)
    seq_no           INT         NOT NULL CHECK (seq_no BETWEEN 1 AND 999),   -- CCC
    revision_no      SMALLINT    NOT NULL DEFAULT 0 CHECK (revision_no BETWEEN 0 AND 99),   -- DD
    previous_gap_id  INT         REFERENCES gap_document(gap_id),
    workflow_status  gap_workflow_status NOT NULL DEFAULT 'DRAFT',
    approval_cycle   SMALLINT    NOT NULL DEFAULT 1,             -- naik setiap reject -> putaran approval baru
    effective_date   DATE        NOT NULL DEFAULT CURRENT_DATE,  -- WI kolom 3: tanggal pembuatan Gap Analysis
    submitted_at     TIMESTAMPTZ,
    stage1_approved_at TIMESTAMPTZ,
    closed_at        TIMESTAMPTZ,
    created_by       INT         NOT NULL REFERENCES users(user_id),
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT ck_gap_no_format CHECK (gap_no ~ '^GAP-(QU|HE|SA|EN|MG|HS)-[0-9]{4}-[0-9]{3}\.[0-9]{2}$'),
    CONSTRAINT uq_gap_regulation_site UNIQUE (regulation_id, site_id),
    CONSTRAINT uq_gap_seq_rev         UNIQUE (site_id, category_id, gap_year, seq_no, revision_no)
);
CREATE INDEX ix_gap_site_cat_status ON gap_document (site_id, category_id, workflow_status);
CREATE INDEX ix_gap_status          ON gap_document (workflow_status);
CREATE INDEX ix_gap_previous        ON gap_document (previous_gap_id);
-- hanya 1 revisi aktif (belum ARCHIVED) per dokumen gap per site.
-- WI: dokumen gap wajib disimpan minimal 1 revisi sebelumnya (kebijakan retensi diatur di level aplikasi/job).
CREATE UNIQUE INDEX uq_gap_one_active ON gap_document (site_id, category_id, gap_year, seq_no) WHERE workflow_status <> 'ARCHIVED';

-- MASTER LIST = dokumen "List Legal Requirement" (WI Lampiran 2). Nomor dokumen AA-00 (AA = kategori, 00 = revisi list).
-- Direview minimal 1x per tahun (review_date = issue_date + 1 tahun). Dibuat Co Gap Supervisor, direview Co Gap Manager.
CREATE TABLE master_list_doc (
    master_list_doc_id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    site_id        SMALLINT NOT NULL REFERENCES site(site_id),
    category_id    SMALLINT NOT NULL REFERENCES category(category_id),
    revision_no    SMALLINT NOT NULL DEFAULT 0 CHECK (revision_no BETWEEN 0 AND 99),
    list_no        VARCHAR(10) NOT NULL,                       -- kolom 3 "No. Doc", mis. EN-00
    issue_date     DATE NOT NULL DEFAULT CURRENT_DATE,         -- kolom 1
    review_date    DATE NOT NULL,                              -- kolom 2: issue_date + 1 tahun
    change_history TEXT,                                       -- kolom 5 (mis. "Dokumen Baru")
    is_current     BOOLEAN NOT NULL DEFAULT TRUE,
    created_by     INT NOT NULL REFERENCES users(user_id),     -- Co Gap Supervisor
    reviewed_by    INT REFERENCES users(user_id),              -- Co Gap Manager
    reviewed_at    TIMESTAMPTZ,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT ck_ml_list_no   CHECK (list_no ~ '^[A-Z]{2}-[0-9]{2}$'),
    CONSTRAINT ck_ml_review    CHECK (review_date > issue_date),
    CONSTRAINT uq_ml_doc       UNIQUE (site_id, category_id, revision_no),
    CONSTRAINT uq_ml_doc_no    UNIQUE (site_id, list_no)
);
CREATE UNIQUE INDEX uq_ml_one_current ON master_list_doc (site_id, category_id) WHERE is_current;
CREATE INDEX ix_ml_review_due ON master_list_doc (review_date) WHERE is_current;     -- pengingat review tahunan

CREATE TABLE master_list_item (
    master_list_item_id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    master_list_doc_id  INT NOT NULL REFERENCES master_list_doc(master_list_doc_id) ON DELETE CASCADE,
    item_no             INT NOT NULL CHECK (item_no >= 1),     -- kolom 6, mulai dari 1
    legal_number        VARCHAR(150) NOT NULL,                 -- kolom 7 (mis. ISO 14001:2015)
    legal_title         TEXT NOT NULL,                         -- kolom 8
    published_date      DATE,                                  -- kolom 10 (tanggal berlaku)
    need_gap_analysis   BOOLEAN NOT NULL DEFAULT TRUE,         -- kolom 11 (Yes/No)
    need_gap_justification TEXT,
    regulation_id       INT REFERENCES regulation(regulation_id),
    gap_id              INT REFERENCES gap_document(gap_id),   -- NULL = belum dilakukan gap analysis
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_ml_item_no UNIQUE (master_list_doc_id, item_no)
);
CREATE INDEX ix_ml_item_gap        ON master_list_item (gap_id);
CREATE INDEX ix_ml_item_regulation ON master_list_item (regulation_id);
CREATE INDEX ix_ml_item_legal_no   ON master_list_item (lower(legal_number));

CREATE TABLE master_list_item_department (                     -- kolom 9 "Interested Parties" (bisa lebih dari 1 departemen)
    master_list_item_id INT NOT NULL REFERENCES master_list_item(master_list_item_id) ON DELETE CASCADE,
    department_id       INT NOT NULL REFERENCES department(department_id),
    PRIMARY KEY (master_list_item_id, department_id)
);

CREATE TABLE change_note (                 -- 007E: catatan perubahan, dipertahankan semua revisi
    change_note_id  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    gap_id          INT NOT NULL REFERENCES gap_document(gap_id) ON DELETE CASCADE,
    new_count       INT NOT NULL DEFAULT 0,
    changed_count   INT NOT NULL DEFAULT 0,
    deleted_count   INT NOT NULL DEFAULT 0,
    change_points   TEXT,                  -- ringkasan, dapat diedit Co Gap Staff
    edited_by       INT REFERENCES users(user_id),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ix_change_note_gap ON change_note (gap_id);

-- -----------------------------------------------------------------------------
-- 5. GAP ANALYSIS & ACTION PLAN  (008A - 008C)
-- -----------------------------------------------------------------------------
CREATE TABLE gap_analysis (
    gap_analysis_id     BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    gap_id              INT    NOT NULL REFERENCES gap_document(gap_id) ON DELETE CASCADE,
    clause_id           BIGINT NOT NULL REFERENCES regulation_clause(clause_id),
    related_document    TEXT,
    in_procedure        BOOLEAN,                        -- tercantum dalam prosedur (Yes/No)
    in_practice         BOOLEAN,                        -- dilakukan pada praktik aktual (Yes/No)
    actual_condition    TEXT,                           -- kondisi aktual / gap
    is_applicable       BOOLEAN NOT NULL DEFAULT TRUE,  -- FALSE => status NA
    dept_in_control_id  INT REFERENCES department(department_id),
    proposed_status     gap_status,                     -- usulan sistem dari in_procedure + in_practice
    status              gap_status,                     -- status final (ditetapkan Co Gap Supervisor)
    change_type         clause_change_type,             -- hasil perbandingan revisi (007D)
    carried_from_id     BIGINT REFERENCES gap_analysis(gap_analysis_id),   -- hasil penilaian revisi sebelumnya
    verified_by         INT REFERENCES users(user_id),
    verified_at         TIMESTAMPTZ,
    verification_notes  TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_gap_analysis_clause UNIQUE (gap_id, clause_id),
    -- NA <=> tidak applicable
    CONSTRAINT ck_gap_na_consistency CHECK ((is_applicable AND status IS DISTINCT FROM 'NA') OR (NOT is_applicable AND status = 'NA') OR status IS NULL),
    -- status sistem: 100 = prosedur & praktik; 0 = keduanya tidak
    CONSTRAINT ck_gap_proposed_rule CHECK (
        proposed_status IS NULL OR NOT is_applicable OR in_procedure IS NULL OR in_practice IS NULL OR
        proposed_status = CASE WHEN in_procedure AND in_practice THEN '100'::gap_status
                               WHEN NOT in_procedure AND NOT in_practice THEN '0'::gap_status
                               ELSE '50'::gap_status END)
);
CREATE INDEX ix_gap_analysis_gap    ON gap_analysis (gap_id);
CREATE INDEX ix_gap_analysis_dept   ON gap_analysis (dept_in_control_id);
CREATE INDEX ix_gap_analysis_status ON gap_analysis (gap_id, status);

CREATE TABLE gap_analysis_co_dept (        -- Co-Dept In Control (bisa > 1 departemen; tiap Manager Area wajib approve)
    gap_analysis_id BIGINT NOT NULL REFERENCES gap_analysis(gap_analysis_id) ON DELETE CASCADE,
    department_id   INT    NOT NULL REFERENCES department(department_id),
    PRIMARY KEY (gap_analysis_id, department_id)
);
CREATE INDEX ix_co_dept_dept ON gap_analysis_co_dept (department_id);

CREATE TABLE action_plan (
    action_plan_id   BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    gap_analysis_id  BIGINT NOT NULL REFERENCES gap_analysis(gap_analysis_id) ON DELETE CASCADE,
    plan_text        TEXT   NOT NULL,
    pic_user_id      INT    NOT NULL REFERENCES users(user_id),
    pic_initials     VARCHAR(10),
    due_date         DATE   NOT NULL,
    create_date      DATE   NOT NULL DEFAULT CURRENT_DATE,      -- titik awal lead time (008B)
    progress_pct     SMALLINT NOT NULL DEFAULT 0 CHECK (progress_pct BETWEEN 0 AND 100),
    progress_notes   TEXT,
    close_date       DATE,                                      -- tanggal penutupan (lead time = close_date - create_date)
    verified_by   INT REFERENCES users(user_id),             -- WI Lampiran 3 kol. 9: verifikasi Co Gap Supervisor
    verified_at   TIMESTAMPTZ,
    fulfillment_notes TEXT,                                     -- WI Lampiran 3 kol. 11: catatan pemenuhan gap
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT ck_action_plan_dates CHECK (due_date >= create_date AND (close_date IS NULL OR close_date >= create_date))
);
CREATE INDEX ix_action_plan_ga       ON action_plan (gap_analysis_id);
CREATE INDEX ix_action_plan_pic_open ON action_plan (pic_user_id, due_date) WHERE close_date IS NULL;

CREATE TABLE action_plan_due_change (      -- 002B: "Verify changes to action plan due dates"
    due_change_id  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    action_plan_id BIGINT NOT NULL REFERENCES action_plan(action_plan_id) ON DELETE CASCADE,
    old_due_date   DATE NOT NULL,
    new_due_date   DATE NOT NULL,
    reason         TEXT NOT NULL,
    status         due_change_status NOT NULL DEFAULT 'REQUESTED',
    requested_by   INT NOT NULL REFERENCES users(user_id),
    requested_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    verified_by    INT REFERENCES users(user_id),
    verified_at    TIMESTAMPTZ
);
CREATE INDEX ix_due_change_plan ON action_plan_due_change (action_plan_id);

CREATE TABLE evidence (                    -- 009B / 009C: bukti tindakan korektif
    evidence_id    BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    action_plan_id BIGINT NOT NULL REFERENCES action_plan(action_plan_id) ON DELETE CASCADE,
    file_name      VARCHAR(255) NOT NULL,
    file_path      TEXT   NOT NULL,
    file_sha256    CHAR(64),
    uploaded_by    INT    NOT NULL REFERENCES users(user_id),
    uploaded_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    is_superseded  BOOLEAN NOT NULL DEFAULT FALSE     -- diganti setelah reject Stage 2
);
CREATE INDEX ix_evidence_plan ON evidence (action_plan_id);

-- -----------------------------------------------------------------------------
-- 6. APPROVAL, DELEGATION, ERES  (009A, 009C, 011D)
-- -----------------------------------------------------------------------------
-- Satu baris = satu langkah approval pada satu putaran (cycle).
-- Stage 1 : Manager Area (tiap dept) -> Co Gap Manager -> QA Manager (site) -> QO Head   (berurutan)
-- Stage 2 : Supervisor verify -> Manager Area -> Co Gap Manager -> QA Manager
-- Aturan WI (dikonfirmasi berlaku di Stage 1 DAN Stage 2): langkah QA Manager hanya WAJIB bila
--            category.requires_qa_manager (Quality/Halal/Manufacturing); untuk HSE (HE/SA/EN) cukup
--            Co Gap Manager -> baris QA Manager dibuat dengan result = 'SKIPPED'.
CREATE TABLE approval (
    approval_id        BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    gap_id             INT  REFERENCES gap_document(gap_id) ON DELETE CASCADE,
    master_list_doc_id INT  REFERENCES master_list_doc(master_list_doc_id) ON DELETE CASCADE,   -- stage MASTER_LIST
    stage              approval_stage NOT NULL,
    cycle_no           SMALLINT NOT NULL DEFAULT 1,
    step_seq           SMALLINT NOT NULL,                   -- urutan langkah; sama = paralel (mis. beberapa Manager Area)
    role_id            SMALLINT NOT NULL REFERENCES role(role_id),
    department_id      INT REFERENCES department(department_id),   -- terisi untuk Manager Area
    assigned_user_id   INT NOT NULL REFERENCES users(user_id),     -- approver yang ditugaskan
    result             approval_result NOT NULL DEFAULT 'PENDING',
    acted_by_user_id   INT REFERENCES users(user_id),              -- yang benar-benar menekan approve/reject (delegate)
    on_behalf_of_user_id INT REFERENCES users(user_id),            -- terisi jika delegasi: "Approved by X on behalf of Y"
    notes              TEXT,
    acted_at           TIMESTAMPTZ,
    -- ERES: tanda tangan elektronik memakai akun + password pengguna sendiri
    signature_meaning  VARCHAR(50),
    signature_hash     CHAR(64),
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT ck_approval_target CHECK ((stage = 'MASTER_LIST' AND master_list_doc_id IS NOT NULL AND gap_id IS NULL)
                                      OR (stage <> 'MASTER_LIST' AND gap_id IS NOT NULL AND master_list_doc_id IS NULL)),
    CONSTRAINT ck_reject_requires_notes CHECK (result <> 'REJECTED' OR (notes IS NOT NULL AND length(btrim(notes)) > 0)),   -- alasan reject wajib
    CONSTRAINT ck_acted_fields CHECK ((result IN ('PENDING','SKIPPED') AND acted_at IS NULL) OR (result IN ('APPROVED','REJECTED') AND acted_at IS NOT NULL AND acted_by_user_id IS NOT NULL)),
    CONSTRAINT ck_delegate_differs CHECK (on_behalf_of_user_id IS NULL OR on_behalf_of_user_id <> acted_by_user_id),
    CONSTRAINT uq_approval_step UNIQUE (gap_id, stage, cycle_no, step_seq, role_id, department_id, assigned_user_id)
);
CREATE INDEX ix_approval_gap      ON approval (gap_id, stage, cycle_no, step_seq);
CREATE INDEX ix_approval_inbox    ON approval (assigned_user_id) WHERE result = 'PENDING';

CREATE TABLE delegation (                  -- 011D
    delegation_id      BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    gap_id             INT NOT NULL REFERENCES gap_document(gap_id),
    role_id            SMALLINT NOT NULL REFERENCES role(role_id),         -- PIC Area, Manager Area, Co Gap Manager, QA Manager, QO Head
    department_id      INT REFERENCES department(department_id),
    original_user_id   INT NOT NULL REFERENCES users(user_id),
    delegate_user_id   INT NOT NULL REFERENCES users(user_id),
    is_active          BOOLEAN NOT NULL DEFAULT TRUE,
    created_by         INT NOT NULL REFERENCES users(user_id),             -- Co Gap Staff / Supervisor
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    ended_at           TIMESTAMPTZ,
    CONSTRAINT ck_delegation_diff CHECK (original_user_id <> delegate_user_id)
);
CREATE UNIQUE INDEX uq_delegation_active ON delegation (gap_id, role_id, COALESCE(department_id, 0), original_user_id) WHERE is_active;
CREATE INDEX ix_delegation_delegate ON delegation (delegate_user_id) WHERE is_active;

-- -----------------------------------------------------------------------------
-- 7. NOTIFICATION (email) (003A)
-- -----------------------------------------------------------------------------
CREATE TABLE notification (
    notification_id   BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    event_type        VARCHAR(50) NOT NULL,       -- DRAFT_READY, ACTION_PLAN_REQUIRED, APPROVAL_PENDING, REJECTED, STAGE1_APPROVED, DUE_REMINDER, OVERDUE, ...
    recipient_user_id INT NOT NULL REFERENCES users(user_id),
    gap_id            INT REFERENCES gap_document(gap_id),
    action_plan_id    BIGINT REFERENCES action_plan(action_plan_id),
    subject           VARCHAR(255) NOT NULL,
    body              TEXT NOT NULL,
    status            notif_status NOT NULL DEFAULT 'QUEUED',
    retry_count       SMALLINT NOT NULL DEFAULT 0,
    scheduled_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    sent_at           TIMESTAMPTZ,
    error_message     TEXT
);
CREATE INDEX ix_notification_queue ON notification (scheduled_at) WHERE status = 'QUEUED';
CREATE INDEX ix_notification_user  ON notification (recipient_user_id, scheduled_at DESC);

-- -----------------------------------------------------------------------------
-- 8. AUDIT TRAIL  (004A)  -  append-only
-- -----------------------------------------------------------------------------
CREATE TABLE log_history (
    log_id               BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    logged_at            TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    user_id              INT REFERENCES users(user_id),
    username             VARCHAR(50),                         -- snapshot
    action               audit_action   NOT NULL,
    activity             audit_activity NOT NULL,
    site_id              SMALLINT REFERENCES site(site_id),
    gap_id               INT,                                 -- tanpa FK agar log tetap utuh
    entity_table         VARCHAR(60),
    entity_id            VARCHAR(60),
    description          TEXT NOT NULL,
    before_value         JSONB,
    after_value          JSONB,
    on_behalf_of_user_id INT REFERENCES users(user_id),
    ip_address           INET
);
CREATE INDEX ix_log_time          ON log_history (logged_at DESC);
CREATE INDEX ix_log_filter        ON log_history (site_id, activity, action, logged_at DESC);
CREATE INDEX ix_log_gap           ON log_history (gap_id);
CREATE INDEX ix_log_entity        ON log_history (entity_table, entity_id);

CREATE FUNCTION fn_log_history_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'log_history is append-only (% not allowed)', TG_OP;
END $$;
CREATE TRIGGER trg_log_history_no_update BEFORE UPDATE OR DELETE ON log_history
    FOR EACH ROW EXECUTE FUNCTION fn_log_history_immutable();
CREATE TRIGGER trg_log_history_no_truncate BEFORE TRUNCATE ON log_history
    FOR EACH STATEMENT EXECUTE FUNCTION fn_log_history_immutable();

-- Trigger generik: catat before/after otomatis. Aplikasi mengisi konteks per transaksi:
--   SET LOCAL app.user_id = '12'; SET LOCAL app.on_behalf_of = '7'; SET LOCAL app.ip = '10.0.0.1';
CREATE FUNCTION fn_audit_row() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
    v_user  INT  := NULLIF(current_setting('app.user_id', true), '')::INT;
    v_obo   INT  := NULLIF(current_setting('app.on_behalf_of', true), '')::INT;
    v_act   audit_activity := TG_ARGV[0]::audit_activity;
    v_new   JSONB; v_old JSONB; v_id TEXT; v_gap INT; v_action audit_action;
BEGIN
    -- Jangan pernah menyimpan hash password di audit trail; abaikan kolom noise (updated_at).
    -- Untuk tabel users, kolom khusus autentikasi diabaikan juga: kejadian login/logout/ganti password
    -- dicatat eksplisit oleh aplikasi (activity AUTH), bukan oleh trigger.
    IF TG_OP <> 'DELETE' THEN v_new := to_jsonb(NEW) - 'password_hash' - 'updated_at'; END IF;
    IF TG_OP <> 'INSERT' THEN v_old := to_jsonb(OLD) - 'password_hash' - 'updated_at'; END IF;
    IF TG_TABLE_NAME = 'users' THEN
        IF v_new IS NOT NULL THEN v_new := v_new - 'password_changed_at' - 'must_change_password' - 'failed_login_count' - 'locked_until' - 'last_login_at'; END IF;
        IF v_old IS NOT NULL THEN v_old := v_old - 'password_changed_at' - 'must_change_password' - 'failed_login_count' - 'locked_until' - 'last_login_at'; END IF;
    END IF;
    v_id  := COALESCE(v_new, v_old) ->> TG_ARGV[1];          -- nama kolom PK
    v_gap := NULLIF(COALESCE(v_new, v_old) ->> 'gap_id', '')::INT;
    v_action := CASE TG_OP WHEN 'INSERT' THEN 'ADD' WHEN 'DELETE' THEN 'DELETE' ELSE 'EDIT' END;
    IF TG_OP = 'UPDATE' AND v_old = v_new THEN RETURN NEW; END IF;
    INSERT INTO log_history (user_id, username, action, activity, gap_id, entity_table, entity_id,
                             description, before_value, after_value, on_behalf_of_user_id, ip_address)
    VALUES (v_user, (SELECT username FROM users WHERE user_id = v_user), v_action, v_act, v_gap, TG_TABLE_NAME, v_id,
            TG_OP || ' ' || TG_TABLE_NAME || ' #' || COALESCE(v_id,'?') ||
              CASE WHEN v_obo IS NOT NULL THEN ' (on behalf of user ' || v_obo || ')' ELSE '' END,
            v_old, v_new, v_obo, NULLIF(current_setting('app.ip', true), '')::INET);
    RETURN COALESCE(NEW, OLD);
END $$;

CREATE TRIGGER trg_audit_users      AFTER INSERT OR UPDATE OR DELETE ON users             FOR EACH ROW EXECUTE FUNCTION fn_audit_row('SETTING_USERS','user_id');
CREATE TRIGGER trg_audit_department AFTER INSERT OR UPDATE OR DELETE ON department        FOR EACH ROW EXECUTE FUNCTION fn_audit_row('SETTING_DEPARTMENT','department_id');
CREATE TRIGGER trg_audit_category   AFTER INSERT OR UPDATE OR DELETE ON category          FOR EACH ROW EXECUTE FUNCTION fn_audit_row('SETTING_CATEGORY_SITE','category_id');
CREATE TRIGGER trg_audit_site       AFTER INSERT OR UPDATE OR DELETE ON site              FOR EACH ROW EXECUTE FUNCTION fn_audit_row('SETTING_CATEGORY_SITE','site_id');
CREATE TRIGGER trg_audit_delegation AFTER INSERT OR UPDATE OR DELETE ON delegation        FOR EACH ROW EXECUTE FUNCTION fn_audit_row('SETTING_DELEGATION','delegation_id');
CREATE TRIGGER trg_audit_regulation AFTER INSERT OR UPDATE OR DELETE ON regulation        FOR EACH ROW EXECUTE FUNCTION fn_audit_row('UPLOAD_REGULATION','regulation_id');
CREATE TRIGGER trg_audit_clause     AFTER INSERT OR UPDATE OR DELETE ON regulation_clause FOR EACH ROW EXECUTE FUNCTION fn_audit_row('UPLOAD_REGULATION','clause_id');
CREATE TRIGGER trg_audit_ml_doc     AFTER INSERT OR UPDATE OR DELETE ON master_list_doc   FOR EACH ROW EXECUTE FUNCTION fn_audit_row('MASTER_LIST','master_list_doc_id');
CREATE TRIGGER trg_audit_ml_item    AFTER INSERT OR UPDATE OR DELETE ON master_list_item  FOR EACH ROW EXECUTE FUNCTION fn_audit_row('MASTER_LIST','master_list_item_id');
CREATE TRIGGER trg_audit_gap_doc    AFTER INSERT OR UPDATE OR DELETE ON gap_document      FOR EACH ROW EXECUTE FUNCTION fn_audit_row('MASTER_LIST','gap_id');
CREATE TRIGGER trg_audit_gap_an     AFTER INSERT OR UPDATE OR DELETE ON gap_analysis      FOR EACH ROW EXECUTE FUNCTION fn_audit_row('GAP_ANALYSIS_ACTION_PLAN','gap_analysis_id');
CREATE TRIGGER trg_audit_action     AFTER INSERT OR UPDATE OR DELETE ON action_plan       FOR EACH ROW EXECUTE FUNCTION fn_audit_row('GAP_ANALYSIS_ACTION_PLAN','action_plan_id');
CREATE TRIGGER trg_audit_approval   AFTER INSERT OR UPDATE OR DELETE ON approval          FOR EACH ROW EXECUTE FUNCTION fn_audit_row('APPROVAL_STAGE1','approval_id');

-- Departemen & user tidak boleh dihapus permanen jika sudah dipakai (011A/011B): cukup nonaktifkan.
CREATE FUNCTION fn_block_delete() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION '% tidak boleh dihapus permanen; gunakan is_active = FALSE', TG_TABLE_NAME;
END $$;
CREATE TRIGGER trg_department_no_delete BEFORE DELETE ON department FOR EACH ROW EXECUTE FUNCTION fn_block_delete();
CREATE TRIGGER trg_users_no_delete      BEFORE DELETE ON users      FOR EACH ROW EXECUTE FUNCTION fn_block_delete();

-- Auto-update updated_at
CREATE FUNCTION fn_touch_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END $$;
DO $$
DECLARE t TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY['site','category','department','users','regulation_clause','gap_document','change_note','gap_analysis','action_plan']
    LOOP
        EXECUTE format('CREATE TRIGGER trg_touch_%1$s BEFORE UPDATE ON %1$s FOR EACH ROW EXECUTE FUNCTION fn_touch_updated_at()', t);
    END LOOP;
END $$;

-- -----------------------------------------------------------------------------
-- 9. VIEWS  (dashboard, lead time, monitoring)
-- -----------------------------------------------------------------------------
-- Tingkat kepatuhan per gap document (WI poin 3 "Perhitungan tingkat kepatuhan"; URS 005A).
-- Dilaporkan sebagai TIGA persentase, masing-masing dibagi total sub-klausul applicable:
--     % 100 = n_100 / applicable,  % 50 = n_50 / applicable,  % 0 = n_0 / applicable
-- (contoh WI: CPOB 350/587 = 59.63%, 163/587 = 27.77%, 74/587 = 12.61%).
-- Klausul N/A dan INFO dikeluarkan.
CREATE VIEW v_compliance AS
SELECT g.gap_id, g.gap_no, g.site_id, g.category_id, g.workflow_status,
       COUNT(*)                                  AS applicable_clauses,
       COUNT(*) FILTER (WHERE ga.status = '100') AS n_100,
       COUNT(*) FILTER (WHERE ga.status = '50')  AS n_50,
       COUNT(*) FILTER (WHERE ga.status = '0')   AS n_0,
       ROUND(100.0 * COUNT(*) FILTER (WHERE ga.status = '100') / NULLIF(COUNT(*),0), 2) AS pct_100,
       ROUND(100.0 * COUNT(*) FILTER (WHERE ga.status = '50')  / NULLIF(COUNT(*),0), 2) AS pct_50,
       ROUND(100.0 * COUNT(*) FILTER (WHERE ga.status = '0')   / NULLIF(COUNT(*),0), 2) AS pct_0
FROM gap_document g
JOIN gap_analysis ga       ON ga.gap_id = g.gap_id
JOIN regulation_clause rc  ON rc.clause_id = ga.clause_id
WHERE ga.is_applicable AND NOT rc.is_info AND ga.status IN ('100','50','0')
GROUP BY g.gap_id;

-- Fulfillment Status pada Master List (WI Lampiran 2 kolom 12):
--   Open        = belum dilakukan analisis gap
--   On Progress = sedang dilakukan analisis gap
--   Closed      = sudah terpenuhi 100% (gap closure) ATAU tidak perlu analisis gap
CREATE VIEW v_master_list_item AS
SELECT d.master_list_doc_id, d.site_id, d.category_id, d.list_no, d.issue_date, d.review_date,
       i.master_list_item_id, i.item_no, i.legal_number, i.legal_title, i.published_date,
       i.need_gap_analysis, i.gap_id, g.gap_no,
       CASE WHEN NOT i.need_gap_analysis               THEN 'CLOSED'
            WHEN i.gap_id IS NULL                      THEN 'OPEN'
            WHEN g.workflow_status IN ('CLOSED','ARCHIVED') THEN 'CLOSED'
            ELSE 'ON_PROGRESS' END AS fulfillment_status
FROM master_list_item i
JOIN master_list_doc d ON d.master_list_doc_id = i.master_list_doc_id
LEFT JOIN gap_document g ON g.gap_id = i.gap_id;

-- Monitoring action plan: lead time, overdue, status (004B)
CREATE VIEW v_action_plan_monitoring AS
SELECT ap.action_plan_id, ap.gap_analysis_id, ga.gap_id, g.gap_no, g.site_id, ga.dept_in_control_id,
       ap.pic_user_id, ap.pic_initials, ap.create_date, ap.due_date, ap.close_date,
       CASE WHEN ap.close_date IS NOT NULL THEN ap.close_date - ap.create_date END AS lead_time_days,
       CASE WHEN ap.close_date IS NULL AND CURRENT_DATE > ap.due_date THEN CURRENT_DATE - ap.due_date ELSE 0 END AS overdue_days,
       CASE WHEN ap.close_date IS NOT NULL AND ap.close_date <= ap.due_date THEN 'ON_TIME'
            WHEN ap.close_date IS NULL     AND CURRENT_DATE  >  ap.due_date THEN 'OVERDUE'
            WHEN ap.close_date IS NOT NULL                                  THEN 'CLOSED_LATE'   -- [ASSUMPTION] ditutup setelah due date
            ELSE 'PENDING' END AS monitoring_status
FROM action_plan ap
JOIN gap_analysis ga ON ga.gap_analysis_id = ap.gap_analysis_id
JOIN gap_document g  ON g.gap_id = ga.gap_id;

COMMIT;
