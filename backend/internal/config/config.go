// Package config memuat konfigurasi aplikasi dari environment variable.
package config

import (
	"fmt"
	"os"
	"strconv"
	"strings"
	"time"
)

type Config struct {
	DatabaseURL  string
	Port         string
	JWTSecretKey string

	// Cookie & CORS/CSRF
	CookieName     string
	CookieSecure   bool
	AllowedOrigins []string // dipakai untuk pemeriksaan header Origin pada request yang mengubah data

	// SMTP Email Delivery
	SMTPHost   string
	SMTPPort   int
	SMTPUser   string
	SMTPPass   string
	SMTPSender string
	SMTPSecure bool

	// Initial Admin Bootstrap
	InitialAdminUsername string
	InitialAdminEmail    string
	InitialAdminPassword string
	InitialAdminFullName string

	// Sesi berakhir setelah 30 menit tanpa aktivitas.
	SessionIdle time.Duration

	// Ganti password berkala setiap 90 hari.
	PasswordMaxAge time.Duration
	// Riwayat password yang tidak boleh dipakai ulang.
	PasswordHistory int

	// Penguncian akun setelah gagal login berulang.
	MaxFailedLogins int
	LockoutDuration time.Duration

	// Password default saat akun pertama kali didaftarkan.
	DefaultPassword string
	BcryptCost      int
}

func Load() (*Config, error) {
	loadDotEnv()
	c := &Config{
		DatabaseURL:          env("DATABASE_URL", ""),
		Port:                 env("PORT", "8080"),
		JWTSecretKey:         env("JWT_SECRET_KEY", "gap-assessment-production-secret-key-change-in-prod-2026"),
		CookieName:           env("COOKIE_NAME", "gap_session"),
		CookieSecure:         envBool("COOKIE_SECURE", true),
		AllowedOrigins:       splitCSV(env("ALLOWED_ORIGINS", "http://localhost:3000")),
		SMTPHost:             env("SMTP_HOST", "kalbeconsumerhealth-com.mail.protection.outlook.com"),
		SMTPPort:             envInt("SMTP_PORT", 25),
		SMTPUser:             env("SMTP_USER", ""),
		SMTPPass:             env("SMTP_PASS", ""),
		SMTPSender:           env("SMTP_SENDER", "notifikasi.gapassessmentonline@kalbeconsumerhealth.co.id"),
		SMTPSecure:           envBool("SMTP_SECURE", false),
		InitialAdminUsername: env("INITIAL_ADMIN_USERNAME", "admin"),
		InitialAdminEmail:    env("INITIAL_ADMIN_EMAIL", "admin@kalbeconsumerhealth.co.id"),
		InitialAdminPassword: env("INITIAL_ADMIN_PASSWORD", "Gap12345"),
		InitialAdminFullName: env("INITIAL_ADMIN_FULLNAME", "System Administrator"),
		SessionIdle:          time.Duration(envInt("SESSION_IDLE_MINUTES", 30)) * time.Minute,
		PasswordMaxAge:       time.Duration(envInt("PASSWORD_MAX_AGE_DAYS", 90)) * 24 * time.Hour,
		PasswordHistory:      envInt("PASSWORD_HISTORY", 5),
		MaxFailedLogins:      envInt("MAX_FAILED_LOGINS", 5),
		LockoutDuration:      time.Duration(envInt("LOCKOUT_MINUTES", 15)) * time.Minute,
		DefaultPassword:      env("DEFAULT_PASSWORD", "Gap12345"),
		BcryptCost:           envInt("BCRYPT_COST", 12),
	}
	if c.DatabaseURL == "" {
		return nil, fmt.Errorf("DATABASE_URL wajib diisi")
	}
	if c.BcryptCost < 10 || c.BcryptCost > 15 {
		return nil, fmt.Errorf("BCRYPT_COST harus antara 10 dan 15")
	}
	return c, nil
}

func env(k, def string) string {
	if v, ok := os.LookupEnv(k); ok && v != "" {
		return v
	}
	return def
}

func envInt(k string, def int) int {
	if v, err := strconv.Atoi(os.Getenv(k)); err == nil {
		return v
	}
	return def
}

func envBool(k string, def bool) bool {
	if v, err := strconv.ParseBool(os.Getenv(k)); err == nil {
		return v
	}
	return def
}

func splitCSV(s string) []string {
	var out []string
	for _, p := range strings.Split(s, ",") {
		if p = strings.TrimSpace(p); p != "" {
			out = append(out, p)
		}
	}
	return out
}

func loadDotEnv() {
	paths := []string{"../.env", ".env", "../.env.production", ".env.production"}
	for _, path := range paths {
		data, err := os.ReadFile(path)
		if err == nil {
			for _, line := range strings.Split(string(data), "\n") {
				line = strings.TrimSpace(line)
				if line == "" || strings.HasPrefix(line, "#") {
					continue
				}
				parts := strings.SplitN(line, "=", 2)
				if len(parts) == 2 {
					key := strings.TrimSpace(parts[0])
					val := strings.TrimSpace(parts[1])
					val = strings.Trim(val, `"'`)
					if _, exists := os.LookupEnv(key); !exists {
						_ = os.Setenv(key, val)
					}
				}
			}
			break
		}
	}
}

