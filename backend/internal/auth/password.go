// Package auth berisi login, sesi, kebijakan password, dan middleware otorisasi.
package auth

import (
	"strings"
	"unicode"

	"golang.org/x/crypto/bcrypt"
)

const (
	MinPasswordLength = 8  // URS 001A: minimal 8 karakter
	maxPasswordBytes  = 72 // batas bcrypt; lebih panjang akan terpotong diam-diam
)

// PolicyViolations memeriksa password baru terhadap URS 001A:
//   - minimal 8 karakter
//   - kombinasi huruf kapital dan angka
//
// Mengembalikan daftar pelanggaran (kosong = lolos).
func PolicyViolations(password, defaultPassword string) []string {
	var v []string
	if len([]rune(password)) < MinPasswordLength {
		v = append(v, "Password must be at least 8 characters long.")
	}
	if len(password) > maxPasswordBytes {
		v = append(v, "Password must not exceed 72 bytes.")
	}
	var hasUpper, hasDigit bool
	for _, r := range password {
		switch {
		case unicode.IsUpper(r):
			hasUpper = true
		case unicode.IsDigit(r):
			hasDigit = true
		}
	}
	if !hasUpper {
		v = append(v, "Password must contain at least one uppercase letter.")
	}
	if !hasDigit {
		v = append(v, "Password must contain at least one number.")
	}
	if strings.EqualFold(password, defaultPassword) {
		v = append(v, "Password must not be the default password.")
	}
	return v
}

func HashPassword(password string, cost int) (string, error) {
	b, err := bcrypt.GenerateFromPassword([]byte(password), cost)
	return string(b), err
}

func CheckPassword(hash, password string) bool {
	return bcrypt.CompareHashAndPassword([]byte(hash), []byte(password)) == nil
}
