"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

// Session expiration modal asking user to log in again.
export default function SessionExpiredDialog({ minutes }: { minutes: number }) {
  const router = useRouter();
  const btn = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    btn.current?.focus();
  }, []);

  return (
    <div
      className="session-expired-shell"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="se-title"
      aria-describedby="se-desc"
    >
      <div className="session-expired-card">
        <img
          src="/logo-kch.png"
          alt="Kalbe Consumer Health"
          style={{ height: "46px", width: "auto", margin: "0 auto 1.25rem", display: "block" }}
        />

        <h2 id="se-title" style={{ fontSize: "1.35rem", fontWeight: 700, margin: "0 0 0.5rem", color: "var(--text)" }}>
          Session Expired
        </h2>

        <p
          id="se-desc"
          style={{
            fontSize: "0.875rem",
            color: "var(--muted)",
            lineHeight: 1.55,
            margin: "0 0 1.5rem",
          }}
        >
          You were signed out after <strong>{minutes} minutes</strong> of inactivity to protect your account. Please log in again to continue.
        </p>

        <button
          ref={btn}
          className="btn btn-primary btn-block"
          style={{
            height: "42px",
            fontSize: "0.925rem",
            fontWeight: 600,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "0.5rem",
            borderRadius: "8px",
            boxShadow: "0 4px 14px rgba(0, 104, 55, 0.25)",
          }}
          onClick={() => router.replace("/login?reason=expired")}
        >
          <span>Log in again</span>
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
            <polyline points="10 17 15 12 10 7" />
            <line x1="15" y1="12" x2="3" y2="12" />
          </svg>
        </button>

        <div
          style={{
            textAlign: "center",
            marginTop: "1.5rem",
            paddingTop: "0.9rem",
            borderTop: "1px solid var(--border)",
            fontSize: "0.76rem",
            color: "var(--muted)",
          }}
        >
          Gap Assessment Online • <span style={{ fontWeight: 600, color: "var(--primary)" }}>Kalbe Consumer Health</span>
        </div>
      </div>

      <footer
        style={{
          marginTop: "1.25rem",
          textAlign: "center",
          fontSize: "0.55rem",
          fontWeight: 600,
          letterSpacing: "0.03em",
          color: "#94a3b8",
          textTransform: "uppercase",
        }}
      >
        © 2026 GAP ASSESSMENT ONLINE. ALL RIGHTS RESERVED.
      </footer>
    </div>
  );
}
