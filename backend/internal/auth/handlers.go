package auth

import (
	"log/slog"
	"net/http"
	"time"

	"gapapp/internal/httpx"
	"gapapp/internal/store"
)

type userDTO struct {
	ID             int    `json:"id"`
	Username       string `json:"username"`
	FullName       string `json:"fullName"`
	Email          string `json:"email"`
	JobTitle       string `json:"jobTitle"`
	Initials       string `json:"initials"`
	Role           string `json:"role"`
	RoleName       string `json:"roleName"`
	Department     string `json:"department"`
	DepartmentName string `json:"departmentName"`
	Site           string `json:"site"`
	SiteName       string `json:"siteName"`
}

func toDTO(u *store.User) userDTO {
	return userDTO{
		ID: u.ID, Username: u.Username, FullName: u.FullName, Email: u.Email, JobTitle: u.JobTitle,
		Initials: u.Initials, Role: u.RoleCode, RoleName: u.RoleName,
		Department: u.DepartmentCode, DepartmentName: u.DepartmentName, Site: u.SiteCode, SiteName: u.SiteName,
	}
}

// Routes mendaftarkan endpoint autentikasi pada mux.
func (s *Service) Routes(mux *http.ServeMux) {
	origin := OriginCheck(s.cfg.AllowedOrigins)
	authed := func(h http.HandlerFunc) http.Handler { return Chain(h, origin, s.Authenticate) }

	mux.Handle("POST /api/auth/login", Chain(http.HandlerFunc(s.handleLogin), origin))
	mux.Handle("POST /api/auth/logout", Chain(http.HandlerFunc(s.handleLogout), origin))
	mux.Handle("GET /api/auth/me", authed(s.handleMe))
	mux.Handle("POST /api/auth/change-password", authed(s.handleChangePassword))
}

func (s *Service) handleLogin(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Username string `json:"username"`
		Password string `json:"password"`
	}
	if err := httpx.Decode(w, r, &req); err != nil {
		httpx.Fail(w, err)
		return
	}
	res, err := s.Login(r.Context(), req.Username, req.Password, httpx.ClientIP(r, s.trustProxy))
	if err != nil {
		if _, ok := err.(*httpx.Error); !ok {
			slog.Error("login", "err", err)
		}
		httpx.Fail(w, err)
		return
	}
	s.setCookie(w, res.SessionID)
	s.writeMe(w, r, res.User, res.ExpiresAt, res.Reason)
}

func (s *Service) handleLogout(w http.ResponseWriter, r *http.Request) {
	if c, err := r.Cookie(s.cfg.CookieName); err == nil && c.Value != "" {
		var u *store.User
		if uid, _, _, err := s.db.ResolveSession(r.Context(), c.Value, s.cfg.SessionIdle, false); err == nil && uid != 0 {
			u, _ = s.db.UserByID(r.Context(), uid)
		}
		if err := s.Logout(r.Context(), c.Value, u, httpx.ClientIP(r, s.trustProxy)); err != nil {
			slog.Error("logout", "err", err)
		}
	}
	s.clearCookie(w)
	httpx.JSON(w, http.StatusOK, map[string]any{"ok": true})
}

func (s *Service) handleMe(w http.ResponseWriter, r *http.Request) {
	u, sess := UserFrom(r.Context()), SessionFrom(r.Context())
	s.writeMe(w, r, u, sess.ExpiresAt, s.passwordChangeReason(u))
}

func (s *Service) writeMe(w http.ResponseWriter, r *http.Request, u *store.User, expires time.Time, reason string) {
	perms, err := s.db.Permissions(r.Context(), u.RoleID)
	if err != nil {
		slog.Error("load permissions", "err", err)
		httpx.Fail(w, err)
		return
	}
	var reasonOut any
	if reason != "" {
		reasonOut = reason
	}
	httpx.JSON(w, http.StatusOK, map[string]any{
		"user":                 toDTO(u),
		"permissions":          perms,
		"passwordChangeReason": reasonOut, // null | FIRST_LOGIN | EXPIRED
		"idleTimeoutSeconds":   int(s.cfg.SessionIdle.Seconds()),
		"sessionExpiresAtUnix": expires.Unix(),
		"passwordMinLength":    MinPasswordLength,
		"passwordMaxAgeDays":   int(s.cfg.PasswordMaxAge.Hours() / 24),
	})
}

func (s *Service) handleChangePassword(w http.ResponseWriter, r *http.Request) {
	var req struct {
		CurrentPassword string `json:"currentPassword"`
		NewPassword     string `json:"newPassword"`
	}
	if err := httpx.Decode(w, r, &req); err != nil {
		httpx.Fail(w, err)
		return
	}
	u, sess := UserFrom(r.Context()), SessionFrom(r.Context())
	if err := s.ChangePassword(r.Context(), u, sess.ID, req.CurrentPassword, req.NewPassword, httpx.ClientIP(r, s.trustProxy)); err != nil {
		if _, ok := err.(*httpx.Error); !ok {
			slog.Error("change password", "err", err)
		}
		httpx.Fail(w, err)
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"ok": true})
}
