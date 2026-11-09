package store

import (
	"context"
	"time"

	"github.com/jackc/pgx/v5"
)

type Site struct {
	ID        int       `json:"id"`
	Code      string    `json:"code"`
	Name      string    `json:"name"`
	IsActive  bool      `json:"isActive"`
	CreatedAt time.Time `json:"createdAt"`
}

type Category struct {
	ID                int    `json:"id"`
	Code              string `json:"code"`
	Name              string `json:"name"`
	RequiresQAManager bool   `json:"requiresQaManager"`
	IsActive          bool   `json:"isActive"`
}

type Department struct {
	ID       int    `json:"id"`
	Code     string `json:"code"`
	Name     string `json:"name"`
	SiteID   int    `json:"siteId"`
	SiteCode string `json:"siteCode"`
	SiteName string `json:"siteName"`
	IsActive bool   `json:"isActive"`
}

type Role struct {
	ID   int    `json:"id"`
	Code string `json:"code"`
	Name string `json:"name"`
}

type UserSummary struct {
	ID             int        `json:"id"`
	Username       string     `json:"username"`
	FullName       string     `json:"fullName"`
	Email          string     `json:"email"`
	JobTitle       string     `json:"jobTitle"`
	Initials       string     `json:"initials"`
	RoleID         int        `json:"roleId"`
	RoleCode       string     `json:"roleCode"`
	RoleName       string     `json:"roleName"`
	DepartmentID   *int       `json:"departmentId"`
	DepartmentCode string     `json:"departmentCode"`
	DepartmentName string     `json:"departmentName"`
	SiteID         *int       `json:"siteId"`
	SiteCode       string     `json:"siteCode"`
	SiteName       string     `json:"siteName"`
	IsActive       bool       `json:"isActive"`
	LastLoginAt    *time.Time `json:"lastLoginAt"`
	CreatedAt      time.Time  `json:"createdAt"`
}

type Delegation struct {
	ID             int64      `json:"id"`
	GapID          int        `json:"gapId"`
	GapNo          string     `json:"gapNo"`
	SiteCode       string     `json:"siteCode"`
	RoleID         int        `json:"roleId"`
	RoleCode       string     `json:"roleCode"`
	DepartmentID   *int       `json:"departmentId"`
	DepartmentCode string     `json:"departmentCode"`
	OriginalUserID int        `json:"principalUserId"`
	OriginalName   string     `json:"principalName"`
	DelegateUserID int        `json:"delegateUserId"`
	DelegateName   string     `json:"delegateName"`
	IsActive       bool       `json:"isActive"`
	CreatedByName  string     `json:"createdByName"`
	CreatedAt      time.Time  `json:"createdAt"`
	EndedAt        *time.Time `json:"endDate"`
}

// ------------------------------------------------ Sites & Categories & Roles

func (s *Store) ListSites(ctx context.Context) ([]Site, error) {
	rows, err := s.Pool.Query(ctx, `SELECT site_id, site_code, site_name, is_active, created_at FROM site ORDER BY site_id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Site{}
	for rows.Next() {
		var item Site
		if err := rows.Scan(&item.ID, &item.Code, &item.Name, &item.IsActive, &item.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, item)
	}
	return out, rows.Err()
}

func (s *Store) ListCategories(ctx context.Context) ([]Category, error) {
	rows, err := s.Pool.Query(ctx, `
		SELECT category_id, category_code, category_name, requires_qa_manager, is_active
		FROM category ORDER BY category_id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Category{}
	for rows.Next() {
		var item Category
		if err := rows.Scan(&item.ID, &item.Code, &item.Name, &item.RequiresQAManager, &item.IsActive); err != nil {
			return nil, err
		}
		out = append(out, item)
	}
	return out, rows.Err()
}

func (s *Store) ListRoles(ctx context.Context) ([]Role, error) {
	rows, err := s.Pool.Query(ctx, `SELECT role_id, role_code, role_name FROM role ORDER BY role_id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Role{}
	for rows.Next() {
		var item Role
		if err := rows.Scan(&item.ID, &item.Code, &item.Name); err != nil {
			return nil, err
		}
		out = append(out, item)
	}
	return out, rows.Err()
}

// ------------------------------------------------ Departments

func (s *Store) ListDepartments(ctx context.Context, siteID *int) ([]Department, error) {
	query := `
		SELECT d.department_id, d.department_code, d.department_name, d.site_id,
		       s.site_code, s.site_name, d.is_active
		FROM department d
		JOIN site s ON s.site_id = d.site_id
		WHERE ($1::smallint IS NULL OR d.site_id = $1::smallint)
		ORDER BY s.site_code, d.department_code`
	rows, err := s.Pool.Query(ctx, query, siteID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Department{}
	for rows.Next() {
		var item Department
		if err := rows.Scan(&item.ID, &item.Code, &item.Name, &item.SiteID, &item.SiteCode, &item.SiteName, &item.IsActive); err != nil {
			return nil, err
		}
		out = append(out, item)
	}
	return out, rows.Err()
}

func (s *Store) SaveDepartment(ctx context.Context, actorUserID int, dept Department) error {
	return s.WithTx(ctx, actorUserID, func(tx pgx.Tx) error {
		if dept.ID == 0 {
			_, err := tx.Exec(ctx, `
				INSERT INTO department (department_code, department_name, site_id, is_active)
				VALUES ($1, $2, $3, $4)`, dept.Code, dept.Name, dept.SiteID, dept.IsActive)
			return err
		}
		_, err := tx.Exec(ctx, `
			UPDATE department
			SET department_name = $2, is_active = $3
			WHERE department_id = $1`, dept.ID, dept.Name, dept.IsActive)
		return err
	})
}

// ------------------------------------------------ Users (URS 006A, 011A)

func (s *Store) ListUsersSummary(ctx context.Context, siteID, deptID *int, search string) ([]UserSummary, error) {
	query := `
		SELECT u.user_id, u.username, u.full_name, u.email, COALESCE(u.job_title,''), COALESCE(u.initials,''),
		       r.role_id, r.role_code, r.role_name,
		       u.department_id, COALESCE(d.department_code,''), COALESCE(d.department_name,''),
		       u.site_id, COALESCE(s.site_code,''), COALESCE(s.site_name,''),
		       u.is_active, u.last_login_at, u.created_at
		FROM users u
		JOIN role r ON r.role_id = u.role_id
		LEFT JOIN department d ON d.department_id = u.department_id
		LEFT JOIN site s ON s.site_id = u.site_id
		WHERE ($1::smallint IS NULL OR u.site_id = $1::smallint)
		  AND ($2::int IS NULL OR u.department_id = $2::int)
		  AND ($3::text = '' OR lower(u.full_name) LIKE '%' || lower($3::text) || '%' OR lower(u.username) LIKE '%' || lower($3::text) || '%')
		ORDER BY u.full_name ASC`
	rows, err := s.Pool.Query(ctx, query, siteID, deptID, search)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []UserSummary{}
	for rows.Next() {
		var u UserSummary
		if err := rows.Scan(&u.ID, &u.Username, &u.FullName, &u.Email, &u.JobTitle, &u.Initials,
			&u.RoleID, &u.RoleCode, &u.RoleName,
			&u.DepartmentID, &u.DepartmentCode, &u.DepartmentName,
			&u.SiteID, &u.SiteCode, &u.SiteName,
			&u.IsActive, &u.LastLoginAt, &u.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, u)
	}
	return out, rows.Err()
}

type CreateUserReq struct {
	Username     string `json:"username"`
	FullName     string `json:"fullName"`
	Email        string `json:"email"`
	JobTitle     string `json:"jobTitle"`
	Initials     string `json:"initials"`
	RoleID       int    `json:"roleId"`
	DepartmentID *int   `json:"departmentId"`
	SiteID       *int   `json:"siteId"`
}

func (s *Store) CreateUserAdmin(ctx context.Context, actorUserID int, req CreateUserReq, defaultPasswordHash string) (int, error) {
	var id int
	err := s.WithTx(ctx, actorUserID, func(tx pgx.Tx) error {
		return tx.QueryRow(ctx, `
			INSERT INTO users (username, full_name, email, job_title, initials, role_id, department_id, site_id, password_hash, must_change_password)
			VALUES ($1, $2, $3, NULLIF($4,''), NULLIF($5,''), $6, $7, $8, $9, TRUE)
			RETURNING user_id`,
			req.Username, req.FullName, req.Email, req.JobTitle, req.Initials,
			req.RoleID, req.DepartmentID, req.SiteID, defaultPasswordHash).Scan(&id)
	})
	return id, err
}

type UpdateUserReq struct {
	ID           int    `json:"id"`
	FullName     string `json:"fullName"`
	Email        string `json:"email"`
	JobTitle     string `json:"jobTitle"`
	Initials     string `json:"initials"`
	RoleID       int    `json:"roleId"`
	DepartmentID *int   `json:"departmentId"`
	SiteID       *int   `json:"siteId"`
	IsActive     bool   `json:"isActive"`
}

func (s *Store) UpdateUserAdmin(ctx context.Context, actorUserID int, req UpdateUserReq) error {
	return s.WithTx(ctx, actorUserID, func(tx pgx.Tx) error {
		_, err := tx.Exec(ctx, `
			UPDATE users
			SET full_name = $2, email = $3, job_title = NULLIF($4,''), initials = NULLIF($5,''),
			    role_id = $6, department_id = $7, site_id = $8, is_active = $9
			WHERE user_id = $1`,
			req.ID, req.FullName, req.Email, req.JobTitle, req.Initials,
			req.RoleID, req.DepartmentID, req.SiteID, req.IsActive)
		return err
	})
}

// ------------------------------------------------ Delegations (URS 011D)

type CreateDelegationReq struct {
	GapID          int        `json:"gapId"`
	RoleID         int        `json:"roleId"`
	DepartmentID   *int       `json:"departmentId"`
	OriginalUserID int        `json:"principalUserId"`
	DelegateUserID int        `json:"delegateUserId"`
	EndedAt        *time.Time `json:"endDate"`
}

func (s *Store) ListDelegations(ctx context.Context, siteID *int) ([]Delegation, error) {
	query := `
		SELECT dl.delegation_id, dl.gap_id, g.gap_no, s.site_code,
		       dl.role_id, r.role_code, dl.department_id, COALESCE(d.department_code,''),
		       dl.original_user_id, u1.full_name, dl.delegate_user_id, u2.full_name,
		       dl.is_active, u3.full_name, dl.created_at, dl.ended_at
		FROM delegation dl
		JOIN gap_document g ON g.gap_id = dl.gap_id
		JOIN site s ON s.site_id = g.site_id
		JOIN role r ON r.role_id = dl.role_id
		LEFT JOIN department d ON d.department_id = dl.department_id
		JOIN users u1 ON u1.user_id = dl.original_user_id
		JOIN users u2 ON u2.user_id = dl.delegate_user_id
		JOIN users u3 ON u3.user_id = dl.created_by
		WHERE ($1::smallint IS NULL OR g.site_id = $1::smallint)
		ORDER BY dl.created_at DESC`
	rows, err := s.Pool.Query(ctx, query, siteID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Delegation{}
	for rows.Next() {
		var item Delegation
		if err := rows.Scan(&item.ID, &item.GapID, &item.GapNo, &item.SiteCode,
			&item.RoleID, &item.RoleCode, &item.DepartmentID, &item.DepartmentCode,
			&item.OriginalUserID, &item.OriginalName, &item.DelegateUserID, &item.DelegateName,
			&item.IsActive, &item.CreatedByName, &item.CreatedAt, &item.EndedAt); err != nil {
			return nil, err
		}
		out = append(out, item)
	}
	return out, rows.Err()
}

func (s *Store) CreateDelegation(ctx context.Context, actorUserID int, req CreateDelegationReq) (int64, error) {
	var id int64
	err := s.WithTx(ctx, actorUserID, func(tx pgx.Tx) error {
		return tx.QueryRow(ctx, `
			INSERT INTO delegation (gap_id, role_id, department_id, original_user_id, delegate_user_id, created_by, ended_at)
			VALUES ($1, $2, $3, $4, $5, $6, $7)
			RETURNING delegation_id`,
			req.GapID, req.RoleID, req.DepartmentID, req.OriginalUserID, req.DelegateUserID,
			actorUserID, req.EndedAt).Scan(&id)
	})
	return id, err
}

func (s *Store) RevokeDelegation(ctx context.Context, actorUserID int, delegationID int64) error {
	return s.WithTx(ctx, actorUserID, func(tx pgx.Tx) error {
		_, err := tx.Exec(ctx, `UPDATE delegation SET is_active = FALSE, ended_at = now() WHERE delegation_id = $1`, delegationID)
		return err
	})
}
