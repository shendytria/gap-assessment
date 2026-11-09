package auth

import (
	"testing"
)

func TestPolicyViolations(t *testing.T) {
	defaultPw := "KCH12345"

	tests := []struct {
		name     string
		password string
		valid    bool
	}{
		{"Short password", "Ab1", false},
		{"No uppercase", "abcdef12", false},
		{"No digit", "Abcdefgh", false},
		{"Default password match", "KCH12345", false},
		{"Valid strong password", "KalbeCompl1ance#2026", true},
		{"Valid minimal password", "Kalbe123", true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			violations := PolicyViolations(tt.password, defaultPw)
			if tt.valid && len(violations) > 0 {
				t.Errorf("expected valid password, got violations: %v", violations)
			}
			if !tt.valid && len(violations) == 0 {
				t.Errorf("expected invalid password, but got no violations")
			}
		})
	}
}

func TestHashAndCheckPassword(t *testing.T) {
	pw := "SecretPassword123"
	hash, err := HashPassword(pw, 10)
	if err != nil {
		t.Fatalf("failed to hash password: %v", err)
	}

	if !CheckPassword(hash, pw) {
		t.Errorf("password verification failed for matching password")
	}

	if CheckPassword(hash, "WrongPassword123") {
		t.Errorf("password verification unexpectedly succeeded for wrong password")
	}
}
