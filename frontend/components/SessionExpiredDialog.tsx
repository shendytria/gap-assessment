"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

// URS 001B: notifikasi muncul dan pengguna diminta login kembali.
export default function SessionExpiredDialog({ minutes }: { minutes: number }) {
  const router = useRouter();
  const btn = useRef<HTMLButtonElement>(null);
  useEffect(() => btn.current?.focus(), []);
  return (
    <div className="overlay" role="alertdialog" aria-modal="true" aria-labelledby="se-title" aria-describedby="se-desc">
      <div className="dialog">
        <h2 id="se-title">Session expired</h2>
        <p id="se-desc">
          You were signed out after {minutes} minutes of inactivity. Please log in again to continue.
        </p>
        <button ref={btn} className="btn btn-primary" onClick={() => router.replace("/login?reason=expired")}>
          Log in again
        </button>
      </div>
    </div>
  );
}
