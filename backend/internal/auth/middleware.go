package auth

import (
	"context"
	"log/slog"
	"net/http"
	"slices"
	"time"

	"gapapp/internal/httpx"
	"gapapp/internal/store"
)

type ctxKey int

const (
	userCtxKey ctxKey = iota
	sessionCtxKey
)

// SessionInfo adalah sesi aktif pada request yang sedang diproses.
type SessionInfo struct {
	ID        string
	ExpiresAt time.Time
}

func UserFrom(ctx context.Context) *store.User {
	u, _ := ctx.Value(userCtxKey).(*store.User)
	return u
}

func SessionFrom(ctx context.Context) *SessionInfo {
	s, _ := ctx.Value(sessionCtxKey).(*SessionInfo)
	return s
}

func (s *Service) setCookie(w http.ResponseWriter, sessionID string) {
	http.SetCookie(w, &http.Cookie{
		Name: s.cfg.CookieName, Value: sessionID, Path: "/",
		HttpOnly: true, Secure: s.cfg.CookieSecure, SameSite: http.SameSiteLaxMode,
		// tanpa Expires/MaxAge: cookie hilang saat browser ditutup; batas idle dijaga server
	})
}

func (s *Service) clearCookie(w http.ResponseWriter) {
	http.SetCookie(w, &http.Cookie{
		Name: s.cfg.CookieName, Value: "", Path: "/", MaxAge: -1,
		HttpOnly: true, Secure: s.cfg.CookieSecure, SameSite: http.SameSiteLaxMode,
	})
}

// Authenticate memvalidasi sesi (URS 001B). Setiap request menggeser batas idle 30 menit,
// kecuali klien menandai request latar belakang dengan header "X-Idle-Poll: 1" agar polling
// otomatis tidak menjaga sesi tetap hidup tanpa aktivitas pengguna.
func (s *Service) Authenticate(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		c, err := r.Cookie(s.cfg.CookieName)
		if err != nil || c.Value == "" {
			httpx.Fail(w, httpx.NewError(http.StatusUnauthorized, "UNAUTHENTICATED", "Please log in."))
			return
		}
		touch := r.Header.Get("X-Idle-Poll") == ""
		uid, exp, state, err := s.db.ResolveSession(r.Context(), c.Value, s.cfg.SessionIdle, touch)
		if err != nil {
			slog.Error("resolve session", "err", err)
			httpx.Fail(w, err)
			return
		}
		switch state {
		case store.SessionNotFound:
			s.clearCookie(w)
			httpx.Fail(w, httpx.NewError(http.StatusUnauthorized, "UNAUTHENTICATED", "Please log in."))
			return
		case store.SessionExpired:
			s.clearCookie(w)
			httpx.Fail(w, httpx.NewError(http.StatusUnauthorized, "SESSION_EXPIRED",
				"Your session has expired due to inactivity. Please log in again."))
			return
		}
		u, err := s.db.UserByID(r.Context(), uid)
		if err != nil {
			slog.Error("load user", "err", err)
			httpx.Fail(w, err)
			return
		}
		if u == nil || !u.IsActive {
			_ = s.db.RevokeSession(r.Context(), c.Value)
			s.clearCookie(w)
			httpx.Fail(w, httpx.NewError(http.StatusUnauthorized, "UNAUTHENTICATED", "Please log in."))
			return
		}
		ctx := context.WithValue(r.Context(), userCtxKey, u)
		ctx = context.WithValue(ctx, sessionCtxKey, &SessionInfo{ID: c.Value, ExpiresAt: exp})
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

// RequirePasswordCurrent memblokir semua fitur selain ganti password bila password masih default
// atau sudah melewati 90 hari (URS 001A).
func (s *Service) RequirePasswordCurrent(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if reason := s.passwordChangeReason(UserFrom(r.Context())); reason != "" {
			httpx.JSON(w, http.StatusForbidden, map[string]any{"error": map[string]any{
				"code": "PASSWORD_CHANGE_REQUIRED", "message": "You must change your password before continuing.", "reason": reason,
			}})
			return
		}
		next.ServeHTTP(w, r)
	})
}

// Aksi izin pada role_permission.
const (
	ActionView     = "view"
	ActionEdit     = "edit"
	ActionApprove  = "approve"
	ActionDownload = "download_pdf"
)

// RequirePermission memeriksa hak akses role (URS 002B) terhadap modul. Dipakai modul-modul berikutnya:
//
//	mux.Handle("GET /api/master-list", chain(h, svc.Authenticate, svc.RequirePasswordCurrent, svc.RequirePermission("MASTER_LIST", auth.ActionView)))
func (s *Service) RequirePermission(module, action string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			u := UserFrom(r.Context())
			perms, err := s.db.Permissions(r.Context(), u.RoleID)
			if err != nil {
				slog.Error("load permissions", "err", err)
				httpx.Fail(w, err)
				return
			}
			allowed := slices.ContainsFunc(perms, func(p store.Permission) bool {
				if p.Module != module {
					return false
				}
				switch action {
				case ActionView:
					return p.CanView
				case ActionEdit:
					return p.CanEdit
				case ActionApprove:
					return p.CanApprove
				case ActionDownload:
					return p.CanDownload
				}
				return false
			})
			if !allowed {
				httpx.Fail(w, httpx.NewError(http.StatusForbidden, "FORBIDDEN", "You do not have access to this feature."))
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}

// OriginCheck menolak request pengubah data dari origin yang tidak dikenal (perlindungan CSRF
// tambahan di atas SameSite=Lax).
func OriginCheck(allowed []string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			switch r.Method {
			case http.MethodPost, http.MethodPut, http.MethodPatch, http.MethodDelete:
				if o := r.Header.Get("Origin"); o != "" && !slices.Contains(allowed, o) {
					httpx.Fail(w, httpx.NewError(http.StatusForbidden, "BAD_ORIGIN", "Request origin is not allowed."))
					return
				}
			}
			next.ServeHTTP(w, r)
		})
	}
}

// Chain menyusun middleware: Chain(h, a, b) = a(b(h)).
func Chain(h http.Handler, mws ...func(http.Handler) http.Handler) http.Handler {
	for i := len(mws) - 1; i >= 0; i-- {
		h = mws[i](h)
	}
	return h
}
