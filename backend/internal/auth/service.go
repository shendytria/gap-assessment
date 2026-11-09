package auth

import (
	"context"
	"fmt"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"

	"gapapp/internal/config"
	"gapapp/internal/httpx"
	"gapapp/internal/store"
)

type Service struct {
	cfg        *config.Config
	db         *store.Store
	trustProxy bool
	dummyHash  string // dipakai agar waktu respons sama untuk username yang tidak ada
}

func NewService(cfg *config.Config, db *store.Store, trustProxy bool) (*Service, error) {
	dummy, err := HashPassword("not-a-real-password", cfg.BcryptCost)
	if err != nil {
		return nil, err
	}
	return &Service{cfg: cfg, db: db, trustProxy: trustProxy, dummyHash: dummy}, nil
}

// Alasan pengguna wajib mengganti password sebelum memakai fitur lain.
const (
	ReasonFirstLogin = "FIRST_LOGIN" // masih memakai password default / di-reset
	ReasonExpired    = "EXPIRED"     // lebih dari 90 hari
)

func (s *Service) passwordChangeReason(u *store.User) string {
	if u.MustChangePassword {
		return ReasonFirstLogin
	}
	if time.Since(u.PasswordChangedAt) > s.cfg.PasswordMaxAge {
		return ReasonExpired
	}
	return ""
}

var errInvalidCreds = httpx.NewError(http.StatusUnauthorized, "INVALID_CREDENTIALS", "Invalid username or password.")

// LoginResult dikembalikan ke handler setelah login berhasil.
type LoginResult struct {
	User      *store.User
	SessionID string
	ExpiresAt time.Time
	Reason    string
}

// Login memverifikasi kredensial (URS 001A) dan membuat sesi.
func (s *Service) Login(ctx context.Context, username, password, ip string) (*LoginResult, error) {
	username = strings.TrimSpace(username)
	if username == "" || password == "" {
		return nil, httpx.NewError(http.StatusBadRequest, "BAD_REQUEST", "Username and password are required.")
	}
	if len(username) > 50 || len(password) > 1024 {
		return nil, errInvalidCreds
	}

	u, err := s.db.UserByUsername(ctx, username)
	if err != nil {
		return nil, err
	}
	if u == nil {
		CheckPassword(s.dummyHash, password) // samakan waktu respons
		s.audit(ctx, nil, username, "Login failed: unknown username", ip)
		return nil, errInvalidCreds
	}

	if u.LockedUntil != nil && u.LockedUntil.After(time.Now()) {
		s.audit(ctx, u, username, "Login rejected: account temporarily locked", ip)
		mins := int(time.Until(*u.LockedUntil).Minutes()) + 1
		return nil, httpx.NewError(http.StatusLocked, "ACCOUNT_LOCKED",
			fmt.Sprintf("Too many failed attempts. Try again in %d minute(s).", mins))
	}

	ok := CheckPassword(u.PasswordHash, password)
	if !ok || !u.IsActive {
		if !u.IsActive {
			s.audit(ctx, u, username, "Login rejected: account is inactive", ip)
			return nil, errInvalidCreds // jangan bocorkan status akun
		}
		locked, err := s.db.RecordFailedLogin(ctx, u.ID, s.cfg.MaxFailedLogins, s.cfg.LockoutDuration)
		if err != nil {
			return nil, err
		}
		s.audit(ctx, u, username, "Login failed: wrong password", ip)
		if locked != nil {
			s.audit(ctx, u, username, "Account locked after repeated failed logins", ip)
			return nil, httpx.NewError(http.StatusLocked, "ACCOUNT_LOCKED",
				fmt.Sprintf("Too many failed attempts. Try again in %d minute(s).", int(s.cfg.LockoutDuration.Minutes())))
		}
		return nil, errInvalidCreds
	}

	if err := s.db.RecordSuccessfulLogin(ctx, u.ID); err != nil {
		return nil, err
	}
	sid, exp, err := s.db.CreateSession(ctx, u.ID, s.cfg.SessionIdle, ip)
	if err != nil {
		return nil, err
	}
	s.audit(ctx, u, username, "Login successful", ip)
	return &LoginResult{User: u, SessionID: sid, ExpiresAt: exp, Reason: s.passwordChangeReason(u)}, nil
}

// Logout mencabut sesi dan mencatatnya di audit trail.
func (s *Service) Logout(ctx context.Context, sessionID string, u *store.User, ip string) error {
	if err := s.db.RevokeSession(ctx, sessionID); err != nil {
		return err
	}
	if u != nil {
		s.auditAction(ctx, u, "LOGOUT", "Logout", ip)
	}
	return nil
}

// ChangePassword menerapkan kebijakan password URS 001A.
func (s *Service) ChangePassword(ctx context.Context, u *store.User, sessionID, current, next, ip string) error {
	if !CheckPassword(u.PasswordHash, current) {
		return httpx.NewError(http.StatusBadRequest, "WRONG_CURRENT_PASSWORD", "Current password is incorrect.")
	}
	if v := PolicyViolations(next, s.cfg.DefaultPassword); len(v) > 0 {
		return &httpx.Error{Status: http.StatusUnprocessableEntity, Code: "WEAK_PASSWORD", Message: strings.Join(v, " ")}
	}

	err := s.db.WithTx(ctx, u.ID, func(tx pgx.Tx) error {
		recent, err := s.db.RecentPasswordHashes(ctx, tx, u.ID, s.cfg.PasswordHistory)
		if err != nil {
			return err
		}
		for _, h := range recent {
			if CheckPassword(h, next) {
				return httpx.NewError(http.StatusUnprocessableEntity, "PASSWORD_REUSED",
					fmt.Sprintf("Choose a password that differs from your last %d passwords.", s.cfg.PasswordHistory))
			}
		}
		hash, err := HashPassword(next, s.cfg.BcryptCost)
		if err != nil {
			return err
		}
		if err := s.db.ApplyPasswordChange(ctx, tx, u.ID, hash); err != nil {
			return err
		}
		// Sesi lain dicabut: bila password bocor, penyerang tidak tetap login.
		if err := s.db.RevokeOtherSessions(ctx, tx, u.ID, sessionID); err != nil {
			return err
		}
		return store.InsertAudit(ctx, tx, store.AuditEntry{
			UserID: &u.ID, Username: u.Username, Action: "UPDATE", Activity: "AUTH",
			SiteID: u.SiteID, Desc: "Password changed", IP: ip,
		})
	})
	return err
}

func (s *Service) audit(ctx context.Context, u *store.User, typed, desc, ip string) {
	e := store.AuditEntry{Username: typed, Action: "LOGIN", Activity: "AUTH", Desc: desc, IP: ip}
	if u != nil {
		e.UserID, e.Username, e.SiteID = &u.ID, u.Username, u.SiteID
	}
	if err := store.InsertAudit(ctx, s.db.Pool, e); err != nil {
		slog.Error("audit trail write failed", "desc", desc, "err", err) // tidak menggagalkan login, tetapi harus terpantau
	}
}

func (s *Service) auditAction(ctx context.Context, u *store.User, action, desc, ip string) {
	if err := store.InsertAudit(ctx, s.db.Pool, store.AuditEntry{
		UserID: &u.ID, Username: u.Username, Action: action, Activity: "AUTH", SiteID: u.SiteID, Desc: desc, IP: ip,
	}); err != nil {
		slog.Error("audit trail write failed", "desc", desc, "err", err)
	}
}
