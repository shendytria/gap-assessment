"use client";

import Link from "next/link";
import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import PasswordField from "@/components/PasswordField";
import { api, isApiError } from "@/lib/api";
import { useSession } from "@/lib/session";

export default function ChangePasswordPage() {
  const { me, refresh } = useSession();
  const router = useRouter();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const minLen = me?.passwordMinLength ?? 8;
  // URS 001A: minimal 8 karakter, kombinasi huruf kapital dan angka
  const rules = useMemo(
    () => [
      { ok: next.length >= minLen, label: `At least ${minLen} characters` },
      { ok: /\p{Lu}/u.test(next), label: "At least one uppercase letter" },
      { ok: /\d/.test(next), label: "At least one number" },
      { ok: next.length > 0 && next === confirm, label: "Both new passwords match" },
    ],
    [next, confirm, minLen],
  );
  const valid = rules.every((r) => r.ok) && current.length > 0;
  const reason = me?.passwordChangeReason ?? null;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!valid || busy) return;
    setBusy(true);
    setError(null);
    try {
      await api("/api/auth/change-password", { method: "POST", body: { currentPassword: current, newPassword: next } });
      await refresh();
      router.replace("/home");
    } catch (err) {
      setError(isApiError(err) ? err.message : "Something went wrong. Please try again.");
      setBusy(false);
    }
  }

  return (
    <main className="page page-narrow">
      <form className="card" onSubmit={onSubmit} noValidate>
        <h1 className="page-title">Change password</h1>

        {reason === "FIRST_LOGIN" && (
          <div className="alert alert-info" role="status">
            You are using a temporary password. Set a new password to continue.
          </div>
        )}
        {reason === "EXPIRED" && (
          <div className="alert alert-info" role="status">
            Your password is older than {me?.passwordMaxAgeDays ?? 90} days. Set a new password to continue.
          </div>
        )}
        {error && <div className="alert alert-error" role="alert">{error}</div>}

        <PasswordField label="Current password" value={current} onChange={setCurrent} autoComplete="current-password" autoFocus />
        <PasswordField label="New password" value={next} onChange={setNext} autoComplete="new-password" describedBy="pw-rules" />
        <PasswordField label="Confirm new password" value={confirm} onChange={setConfirm} autoComplete="new-password" describedBy="pw-rules" />

        <ul className="rules" id="pw-rules" aria-label="Password requirements">
          {rules.map((r) => (
            <li key={r.label} className={r.ok ? "ok" : ""}>
              <span aria-hidden="true">{r.ok ? "✓" : "○"}</span> {r.label}
              <span className="sr-only">{r.ok ? " (met)" : " (not met)"}</span>
            </li>
          ))}
        </ul>

        <div className="actions">
          <button className="btn btn-primary" type="submit" disabled={!valid || busy}>
            {busy ? "Saving…" : "Save new password"}
          </button>
          {!reason && (
            <Link href="/home" className="btn btn-ghost">Cancel</Link>
          )}
        </div>
      </form>
    </main>
  );
}
