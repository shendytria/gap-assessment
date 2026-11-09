// Package httpx berisi helper kecil untuk handler HTTP JSON.
package httpx

import (
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net"
	"net/http"
	"strings"
)

// Error adalah error API dengan kode yang stabil untuk dibaca frontend.
type Error struct {
	Status  int    `json:"-"`
	Code    string `json:"code"`
	Message string `json:"message"`
}

func (e *Error) Error() string { return e.Code + ": " + e.Message }

func NewError(status int, code, msg string) *Error {
	return &Error{Status: status, Code: code, Message: msg}
}

func JSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(status)
	if v != nil {
		_ = json.NewEncoder(w).Encode(v)
	}
}

func Fail(w http.ResponseWriter, err error) {
	var e *Error
	if errors.As(err, &e) {
		JSON(w, e.Status, map[string]any{"error": e})
		return
	}
	slog.Error("request error", "err", err)
	JSON(w, http.StatusInternalServerError, map[string]any{
		"error": &Error{Code: "INTERNAL_ERROR", Message: "Something went wrong. Please try again."},
	})
}

// Decode membaca body JSON (maks 1 MB, field tak dikenal ditolak).
func Decode(w http.ResponseWriter, r *http.Request, dst any) error {
	r.Body = http.MaxBytesReader(w, r.Body, 1<<20)
	dec := json.NewDecoder(r.Body)
	dec.DisallowUnknownFields()
	if err := dec.Decode(dst); err != nil {
		return NewError(http.StatusBadRequest, "BAD_REQUEST", "Invalid request body.")
	}
	if dec.More() {
		return NewError(http.StatusBadRequest, "BAD_REQUEST", "Invalid request body.")
	}
	if _, err := dec.Token(); err != io.EOF {
		return NewError(http.StatusBadRequest, "BAD_REQUEST", "Invalid request body.")
	}
	return nil
}

// ClientIP mengembalikan IP klien. X-Forwarded-For hanya dipercaya bila aplikasi
// berjalan di belakang reverse proxy tepercaya (set TRUST_PROXY=1 di main).
func ClientIP(r *http.Request, trustProxy bool) string {
	if trustProxy {
		if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
			return strings.TrimSpace(strings.Split(xff, ",")[0])
		}
	}
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return host
}
