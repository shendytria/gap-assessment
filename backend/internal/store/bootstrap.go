package store

import (
	"context"
	"fmt"
	"log/slog"

	"golang.org/x/crypto/bcrypt"
)

// BootstrapAdmin ensures that the initial admin account exists and has full access permissions.
// If the database has no admin/supervisor or if the configured admin does not exist, it creates the admin
// with must_change_password = true, allowing seamless first-login onboarding.
func (s *Store) BootstrapAdmin(ctx context.Context, username, email, fullName, password string, bcryptCost int) error {
	if username == "" {
		username = "admin"
	}
	if email == "" {
		email = "admin@kalbeconsumerhealth.co.id"
	}
	if fullName == "" {
		fullName = "System Administrator"
	}
	if password == "" {
		password = "Gap12345"
	}
	if bcryptCost < 10 || bcryptCost > 15 {
		bcryptCost = 12
	}

	// 1. Ensure CO_GAP_SUPERVISOR has full module permissions (All 11 modules)
	allModules := []string{
		"DASHBOARD",
		"MASTER_LIST",
		"UPLOAD_REGULATION",
		"GAP_ANALYSIS",
		"DELEGATION",
		"APPROVAL_S1",
		"APPROVAL_S2",
		"OUTSTANDING_EXECUTION",
		"MONITORING",
		"AUDIT_TRAIL",
		"SETTING",
	}

	for _, mod := range allModules {
		_, err := s.Pool.Exec(ctx, `
			INSERT INTO gap.role_permission (role_id, module, can_view, can_edit, can_approve, can_download_pdf)
			SELECT r.role_id, $1, TRUE, TRUE, TRUE, TRUE
			FROM gap.role r
			WHERE r.role_code = 'CO_GAP_SUPERVISOR'
			ON CONFLICT (role_id, module)
			DO UPDATE SET can_view = TRUE, can_edit = TRUE, can_approve = TRUE, can_download_pdf = TRUE
		`, mod)
		if err != nil {
			slog.Warn("ensure supervisor permission", "module", mod, "err", err)
		}
	}

	// 2. Check if admin user already exists (by username or email)
	var existingID int
	err := s.Pool.QueryRow(ctx, `
		SELECT user_id FROM gap.users
		WHERE lower(username) = lower($1) OR lower(email) = lower($2)
		LIMIT 1
	`, username, email).Scan(&existingID)

	if err == nil && existingID > 0 {
		slog.Info("bootstrap admin already exists", "userID", existingID, "email", email)
		return nil
	}

	// 3. Hash password
	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcryptCost)
	if err != nil {
		return fmt.Errorf("hash initial admin password: %w", err)
	}

	// 4. Find role_id for CO_GAP_SUPERVISOR and site_id for CKR (optional, can be fallback)
	var roleID int
	if err := s.Pool.QueryRow(ctx, `SELECT role_id FROM gap.role WHERE role_code = 'CO_GAP_SUPERVISOR'`).Scan(&roleID); err != nil {
		roleID = 2
	}

	var siteID *int
	var sid int
	if err := s.Pool.QueryRow(ctx, `SELECT site_id FROM gap.site WHERE site_code = 'CKR' LIMIT 1`).Scan(&sid); err == nil {
		siteID = &sid
	}

	// 5. Insert admin user
	var newID int
	err = s.Pool.QueryRow(ctx, `
		INSERT INTO gap.users (
			username, full_name, email, job_title, initials,
			role_id, department_id, site_id,
			password_hash, must_change_password, is_active
		) VALUES (
			$1, $2, $3, 'System Administrator', 'ADM',
			$4, NULL, $5,
			$6, TRUE, TRUE
		)
		ON CONFLICT (lower(username)) DO NOTHING
		RETURNING user_id
	`, username, fullName, email, roleID, siteID, string(hash)).Scan(&newID)

	if err != nil {
		slog.Warn("bootstrap admin insert error (or already existed)", "err", err)
	} else {
		slog.Info("bootstrap admin created successfully", "userID", newID, "email", email, "username", username)
	}

	return nil
}
