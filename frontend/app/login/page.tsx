"use client";

import { FormEvent, Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import PasswordField from "@/components/PasswordField";
import { api, isApiError, Me } from "@/lib/api";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const expired = params.get("reason") === "expired";

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // sudah login? langsung ke aplikasi
  useEffect(() => {
    api<Me>("/api/auth/me", { background: true })
      .then((m) => router.replace(m.passwordChangeReason ? "/change-password" : "/home"))
      .catch(() => undefined);
  }, [router]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const m = await api<Me>("/api/auth/login", { method: "POST", body: { username, password } });
      router.replace(m.passwordChangeReason ? "/change-password" : "/home");
    } catch (err) {
      setError(isApiError(err) ? err.message : "Something went wrong. Please try again.");
      setPassword("");
      setBusy(false);
    }
  }

  return (
    <main className="auth-shell">
      <form className="auth-card" onSubmit={onSubmit} noValidate>
        <div style={{ textAlign: "center", marginBottom: "1.25rem" }}>
          <img
            src="/logo-kch.png"
            alt="Kalbe Consumer Health"
            style={{ height: "46px", width: "auto", margin: "0 auto 1.25rem", display: "block" }}
          />
          <h1 style={{ fontSize: "1.35rem", fontWeight: 700, margin: "0 0 0.35rem", color: "var(--text)", letterSpacing: "-0.01em" }}>
            Gap Assessment Online
          </h1>
          <p style={{ margin: 0, fontSize: "0.85rem", color: "var(--muted)" }}>
            Log in to your compliance account
          </p>
        </div>

        {expired && !error && (
          <div className="alert alert-info" role="status">Your session expired. Please log in again.</div>
        )}
        {error && <div className="alert alert-error" role="alert" id="login-error">{error}</div>}

        <div className="field">
          <label htmlFor="username" style={{ fontSize: "0.82rem", fontWeight: 500, color: "var(--text)" }}>Username</label>
          <input
            id="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            autoFocus
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? "login-error" : undefined}
          />
        </div>

        <PasswordField
          label="Password"
          value={password}
          onChange={setPassword}
          autoComplete="current-password"
          invalid={!!error}
          describedBy={error ? "login-error" : undefined}
        />

        <button
          className="btn btn-primary btn-block"
          type="submit"
          disabled={busy || !username || !password}
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
            marginTop: "1.25rem",
          }}
        >
          <span>{busy ? "Logging in…" : "Log in"}</span>
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
          Developed by <span style={{ fontWeight: 600, color: "var(--primary)" }}>Shendy Tria</span>
        </div>
      </form>

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
        © 2026 GAP ASSESSMENT ONLINE. ALL RIGHTS RESERVED. KALBE CONSUMER HEALTH.
      </footer>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
