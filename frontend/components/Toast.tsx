"use client";

import React, { useEffect } from "react";

export type ToastMessage =
  | { type?: "ok" | "err" | "info" | "warn"; text: string }
  | string
  | null;

type ToastProps = {
  toast: ToastMessage;
  onClose: () => void;
  duration?: number;
};

export function Toast({ toast, onClose, duration = 4000 }: ToastProps) {
  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(onClose, duration);
    return () => window.clearTimeout(t);
  }, [toast, onClose, duration]);

  if (!toast) return null;

  const type = typeof toast === "string" ? "ok" : toast.type || "ok";
  const text = typeof toast === "string" ? toast : toast.text;

  const isOk = type === "ok";
  const isErr = type === "err";
  const isWarn = type === "warn";
  const isInfo = type === "info";

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: "fixed",
        top: "1.25rem",
        right: "1.25rem",
        zIndex: 10000,
        maxWidth: "420px",
        display: "flex",
        alignItems: "flex-start",
        gap: "0.75rem",
        padding: "0.85rem 1.15rem",
        borderRadius: "10px",
        background: isErr
          ? "var(--err-bg)"
          : isWarn
          ? "#fffbeb"
          : isInfo
          ? "var(--info-bg)"
          : "var(--surface)",
        border: `1px solid ${
          isErr
            ? "var(--err-border)"
            : isWarn
            ? "#fde68a"
            : isInfo
            ? "var(--info-border)"
            : "var(--border)"
        }`,
        color: isErr
          ? "var(--err-text)"
          : isWarn
          ? "#92400e"
          : isInfo
          ? "var(--primary)"
          : "var(--text)",
        boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.08)",
        fontSize: "0.875rem",
        lineHeight: 1.45,
        animation: "slideInDown 0.22s cubic-bezier(0.16, 1, 0.3, 1)",
      }}
    >
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          flexShrink: 0,
          marginTop: "2px",
          color: isErr ? "var(--err-text)" : isWarn ? "#b45309" : "var(--ok)",
        }}
      >
        {isErr ? (
          <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
        ) : isWarn ? (
          <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        )}
      </span>

      <span style={{ flex: 1, fontWeight: 500 }}>{text}</span>

      <button
        type="button"
        onClick={onClose}
        aria-label="Close notification"
        style={{
          background: "none",
          border: "none",
          color: "inherit",
          cursor: "pointer",
          fontSize: "1.2rem",
          lineHeight: 1,
          padding: 0,
          marginLeft: "0.25rem",
          opacity: 0.6,
          transition: "opacity 0.15s",
        }}
        onMouseEnter={(e) => (e.currentTarget.style.opacity = "1")}
        onMouseLeave={(e) => (e.currentTarget.style.opacity = "0.6")}
      >
        ×
      </button>
    </div>
  );
}
