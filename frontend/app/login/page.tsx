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
      <form className="card auth-card" onSubmit={onSubmit} noValidate>
        <div style={{ textAlign: "center", marginBottom: "1.5rem" }}>
          <img
            src="/logo-kch.png"
            alt="Kalbe Consumer Health"
            style={{ height: "54px", width: "auto", margin: "0 auto 1rem", display: "block" }}
          />
          <h2 style={{ fontSize: "1.4rem", margin: "0 0 0.35rem", color: "var(--primary)" }}>Gap Assessment Online</h2>
          <p className="muted" style={{ margin: 0, fontSize: "0.875rem" }}>
            Log in to your compliance account
          </p>
        </div>

        {expired && !error && (
          <div className="alert alert-info" role="status">Your session expired. Please log in again.</div>
        )}
        {error && <div className="alert alert-error" role="alert" id="login-error">{error}</div>}

        <div className="field">
          <label htmlFor="username">Username</label>
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

        <button className="btn btn-primary btn-block" type="submit" disabled={busy || !username || !password}>
          {busy ? "Logging in…" : "Log in"}
        </button>
      </form>
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
