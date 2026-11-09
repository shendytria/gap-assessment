// Package store berisi akses database (PostgreSQL via pgx) untuk modul autentikasi.
package store

import (
	"context"
	"errors"
	"fmt"
	"regexp"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Store struct {
	Pool *pgxpool.Pool
}

// New membuka connection pool. Semua koneksi memakai search_path = gap,public.
func New(ctx context.Context, databaseURL string) (*Store, error) {
	cfg, err := pgxpool.ParseConfig(databaseURL)
	if err != nil {
		return nil, fmt.Errorf("parse DATABASE_URL: %w", err)
	}
	if cfg.ConnConfig.RuntimeParams == nil {
		cfg.ConnConfig.RuntimeParams = map[string]string{}
	}
	cfg.ConnConfig.RuntimeParams["search_path"] = "gap,public"
	pool, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		return nil, err
	}
	if err := pool.Ping(ctx); err != nil {
		pool.Close()
		return nil, fmt.Errorf("ping database: %w", err)
	}
	return &Store{Pool: pool}, nil
}

func (s *Store) Close() { s.Pool.Close() }

// Execer dipenuhi oleh *pgxpool.Pool maupun pgx.Tx.
type Execer interface {
	Exec(ctx context.Context, sql string, args ...any) (pgconn.CommandTag, error)
}

// WithTx menjalankan fn dalam transaksi dan menyetel konteks audit (app.user_id)
// agar trigger audit database mengetahui siapa pelaku perubahan.
func (s *Store) WithTx(ctx context.Context, actorUserID int, fn func(tx pgx.Tx) error) error {
	tx, err := s.Pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	if _, err := tx.Exec(ctx, `SELECT set_config('app.user_id', $1, true)`, fmt.Sprint(actorUserID)); err != nil {
		return err
	}
	if err := fn(tx); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

// ---------------------------------------------------------------- users

type User struct {
	ID                 int
	Username           string
	FullName           string
	Email              string
	JobTitle           string
	Initials           string
	RoleID             int
	RoleCode           string
	RoleName           string
	DepartmentCode     string
	DepartmentName     string
	SiteID             *int
	SiteCode           string
	SiteName           string
	PasswordHash       string
	MustChangePassword bool
	PasswordChangedAt  time.Time
	FailedLoginCount   int
	LockedUntil        *time.Time
	IsActive           bool
}

const userSelect = `
SELECT u.user_id, u.username, u.full_name, u.email, COALESCE(u.job_title,''), COALESCE(u.initials,''),
       r.role_id, r.role_code, r.role_name,
       COALESCE(d.department_code,''), COALESCE(d.department_name,''),
       u.site_id, COALESCE(s.site_code,''), COALESCE(s.site_name,''),
       u.password_hash, u.must_change_password, u.password_changed_at,
       u.failed_login_count, u.locked_until, u.is_active
FROM users u
JOIN role r             ON r.role_id = u.role_id
LEFT JOIN department d  ON d.department_id = u.department_id
LEFT JOIN site s        ON s.site_id = u.site_id
`

func scanUser(row pgx.Row) (*User, error) {
	var u User
	err := row.Scan(&u.ID, &u.Username, &u.FullName, &u.Email, &u.JobTitle, &u.Initials,
		&u.RoleID, &u.RoleCode, &u.RoleName,
		&u.DepartmentCode, &u.DepartmentName,
		&u.SiteID, &u.SiteCode, &u.SiteName,
		&u.PasswordHash, &u.MustChangePassword, &u.PasswordChangedAt,
		&u.FailedLoginCount, &u.LockedUntil, &u.IsActive)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	return &u, err
}

// UserByUsername mencari user tanpa membedakan huruf besar/kecil. Mengembalikan nil bila tidak ada.
func (s *Store) UserByUsername(ctx context.Context, username string) (*User, error) {
	return scanUser(s.Pool.QueryRow(ctx, userSelect+` WHERE lower(u.username) = lower($1)`, username))
}

func (s *Store) UserByID(ctx context.Context, id int) (*User, error) {
	return scanUser(s.Pool.QueryRow(ctx, userSelect+` WHERE u.user_id = $1`, id))
}

// RecordFailedLogin menaikkan penghitung gagal login; bila mencapai batas, akun dikunci
// dan penghitung direset. Mengembalikan waktu kunci (nil bila belum terkunci).
func (s *Store) RecordFailedLogin(ctx context.Context, userID, maxFailed int, lock time.Duration) (*time.Time, error) {
	var lockedUntil *time.Time
	err := s.Pool.QueryRow(ctx, `
		UPDATE users SET
		    failed_login_count = CASE WHEN failed_login_count + 1 >= $2 THEN 0 ELSE failed_login_count + 1 END,
		    locked_until       = CASE WHEN failed_login_count + 1 >= $2 THEN now() + make_interval(secs => $3) ELSE locked_until END
		WHERE user_id = $1
		RETURNING locked_until`, userID, maxFailed, lock.Seconds()).Scan(&lockedUntil)
	if lockedUntil != nil && !lockedUntil.After(time.Now()) {
		lockedUntil = nil
	}
	return lockedUntil, err
}

func (s *Store) RecordSuccessfulLogin(ctx context.Context, userID int) error {
	_, err := s.Pool.Exec(ctx,
		`UPDATE users SET failed_login_count = 0, locked_until = NULL, last_login_at = now() WHERE user_id = $1`, userID)
	return err
}

// RecentPasswordHashes mengembalikan hash password saat ini + (n-1) hash terakhir dari riwayat.
func (s *Store) RecentPasswordHashes(ctx context.Context, tx pgx.Tx, userID, n int) ([]string, error) {
	hashes := []string{}
	var cur string
	if err := tx.QueryRow(ctx, `SELECT password_hash FROM users WHERE user_id = $1 FOR UPDATE`, userID).Scan(&cur); err != nil {
		return nil, err
	}
	hashes = append(hashes, cur)
	if n > 1 {
		rows, err := tx.Query(ctx,
			`SELECT password_hash FROM password_history WHERE user_id = $1 ORDER BY changed_at DESC LIMIT $2`, userID, n-1)
		if err != nil {
			return nil, err
		}
		defer rows.Close()
		for rows.Next() {
			var h string
			if err := rows.Scan(&h); err != nil {
				return nil, err
			}
			hashes = append(hashes, h)
		}
		if err := rows.Err(); err != nil {
			return nil, err
		}
	}
	return hashes, nil
}

// ApplyPasswordChange menyimpan hash lama ke riwayat lalu memasang hash baru.
func (s *Store) ApplyPasswordChange(ctx context.Context, tx pgx.Tx, userID int, newHash string) error {
	if _, err := tx.Exec(ctx,
		`INSERT INTO password_history (user_id, password_hash) SELECT user_id, password_hash FROM users WHERE user_id = $1`, userID); err != nil {
		return err
	}
	_, err := tx.Exec(ctx, `
		UPDATE users SET password_hash = $2, must_change_password = FALSE, password_changed_at = now(),
		                 failed_login_count = 0, locked_until = NULL
		WHERE user_id = $1`, userID, newHash)
	return err
}

// ---------------------------------------------------------------- sessions

type SessionState int

const (
	SessionOK SessionState = iota
	SessionNotFound
	SessionExpired // ada, tetapi sudah lewat batas idle atau dicabut
)

var uuidRe = regexp.MustCompile(`^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$`)

func (s *Store) CreateSession(ctx context.Context, userID int, idle time.Duration, ip string) (string, time.Time, error) {
	var id string
	var exp time.Time
	err := s.Pool.QueryRow(ctx, `
		INSERT INTO user_session (user_id, expires_at, ip_address)
		VALUES ($1, now() + make_interval(secs => $2), NULLIF($3,'')::inet)
		RETURNING session_id::text, expires_at`, userID, idle.Seconds(), ip).Scan(&id, &exp)
	return id, exp, err
}

// ResolveSession memvalidasi sesi. Bila touch = true, batas idle digeser (sliding window)
// sehingga sesi hanya berakhir setelah `idle` tanpa aktivitas.
func (s *Store) ResolveSession(ctx context.Context, sessionID string, idle time.Duration, touch bool) (userID int, expiresAt time.Time, state SessionState, err error) {
	if !uuidRe.MatchString(sessionID) {
		return 0, time.Time{}, SessionNotFound, nil
	}
	if touch {
		err = s.Pool.QueryRow(ctx, `
			UPDATE user_session
			   SET last_activity_at = now(), expires_at = now() + make_interval(secs => $2)
			 WHERE session_id = $1::uuid AND revoked_at IS NULL AND expires_at > now()
			RETURNING user_id, expires_at`, sessionID, idle.Seconds()).Scan(&userID, &expiresAt)
		if err == nil {
			return userID, expiresAt, SessionOK, nil
		}
		if !errors.Is(err, pgx.ErrNoRows) {
			return 0, time.Time{}, SessionNotFound, err
		}
	}
	var revoked *time.Time
	err = s.Pool.QueryRow(ctx,
		`SELECT user_id, expires_at, revoked_at FROM user_session WHERE session_id = $1::uuid`, sessionID).
		Scan(&userID, &expiresAt, &revoked)
	if errors.Is(err, pgx.ErrNoRows) {
		return 0, time.Time{}, SessionNotFound, nil
	}
	if err != nil {
		return 0, time.Time{}, SessionNotFound, err
	}
	if revoked != nil || !expiresAt.After(time.Now()) {
		return userID, expiresAt, SessionExpired, nil
	}
	return userID, expiresAt, SessionOK, nil
}

func (s *Store) RevokeSession(ctx context.Context, sessionID string) error {
	if !uuidRe.MatchString(sessionID) {
		return nil
	}
	_, err := s.Pool.Exec(ctx,
		`UPDATE user_session SET revoked_at = now() WHERE session_id = $1::uuid AND revoked_at IS NULL`, sessionID)
	return err
}

// RevokeOtherSessions mencabut semua sesi user kecuali sesi yang sedang dipakai (mis. setelah ganti password).
func (s *Store) RevokeOtherSessions(ctx context.Context, tx pgx.Tx, userID int, keepSessionID string) error {
	_, err := tx.Exec(ctx, `
		UPDATE user_session SET revoked_at = now()
		 WHERE user_id = $1 AND revoked_at IS NULL AND session_id <> $2::uuid`, userID, keepSessionID)
	return err
}

// PurgeSessions menghapus sesi yang sudah lama kedaluwarsa.
func (s *Store) PurgeSessions(ctx context.Context) error {
	_, err := s.Pool.Exec(ctx,
		`DELETE FROM user_session WHERE expires_at < now() - interval '7 days' OR revoked_at < now() - interval '7 days'`)
	return err
}

// ---------------------------------------------------------------- permissions

type Permission struct {
	Module      string `json:"module"`
	CanView     bool   `json:"canView"`
	CanEdit     bool   `json:"canEdit"`
	CanApprove  bool   `json:"canApprove"`
	CanDownload bool   `json:"canDownloadPdf"`
}

func (s *Store) Permissions(ctx context.Context, roleID int) ([]Permission, error) {
	rows, err := s.Pool.Query(ctx, `
		SELECT module, can_view, can_edit, can_approve, can_download_pdf
		  FROM role_permission WHERE role_id = $1 ORDER BY module`, roleID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Permission{}
	for rows.Next() {
		var p Permission
		if err := rows.Scan(&p.Module, &p.CanView, &p.CanEdit, &p.CanApprove, &p.CanDownload); err != nil {
			return nil, err
		}
		out = append(out, p)
	}
	return out, rows.Err()
}

// ---------------------------------------------------------------- audit trail

type AuditEntry struct {
	UserID   *int
	Username string
	Action   string // audit_action: LOGIN, LOGOUT, UPDATE, ...
	Activity string // audit_activity: AUTH, ...
	SiteID   *int
	Desc     string
	IP       string
}

// InsertAudit menulis satu baris ke log_history (append-only).
func InsertAudit(ctx context.Context, q Execer, e AuditEntry) error {
	if len(e.Username) > 50 {
		e.Username = e.Username[:50]
	}
	_, err := q.Exec(ctx, `
		INSERT INTO log_history (user_id, username, action, activity, site_id, description, ip_address)
		VALUES ($1, NULLIF($2,''), $3::audit_action, $4::audit_activity, $5, $6, NULLIF($7,'')::inet)`,
		e.UserID, e.Username, e.Action, e.Activity, e.SiteID, e.Desc, e.IP)
	return err
}
