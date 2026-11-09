"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { api, isApiError, Me, SESSION_EXPIRED_EVENT } from "./api";

type Status = "loading" | "authed" | "anon" | "expired";

type Ctx = {
  me: Me | null;
  status: Status;
  /** Batas idle (menit) dari server; tetap tersedia setelah sesi berakhir untuk pesan notifikasi. */
  idleMinutes: number;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
  can: (module: string, action?: "view" | "edit" | "approve" | "download") => boolean;
};

const SessionContext = createContext<Ctx | null>(null);

// URS 001B: waktu sesi dihitung dari aktivitas keyboard atau klik mouse terakhir.
const ACTIVITY_EVENTS = ["keydown", "mousedown", "touchstart"] as const;
const TICK_MS = 15_000;
const HEARTBEAT_MIN_GAP_MS = 60_000;

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [status, setStatus] = useState<Status>("loading");
  const [idleMinutes, setIdleMinutes] = useState(30);
  const lastActivity = useRef(Date.now());
  const lastSync = useRef(Date.now());
  const meRef = useRef<Me | null>(null);
  meRef.current = me;

  const refresh = useCallback(async () => {
    try {
      const m = await api<Me>("/api/auth/me");
      lastSync.current = Date.now();
      setMe(m);
      setIdleMinutes(Math.round(m.idleTimeoutSeconds / 60));
      setStatus("authed");
    } catch (e) {
      setMe(null);
      // SESSION_EXPIRED sudah memicu event; status ditangani listener di bawah.
      if (!(isApiError(e) && e.code === "SESSION_EXPIRED")) setStatus("anon");
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      await api("/api/auth/logout", { method: "POST", body: {} });
    } catch {
      /* tetap keluar di sisi klien */
    }
    setMe(null);
    setStatus("anon");
  }, []);

  // muat sesi saat pertama kali
  useEffect(() => {
    void refresh();
  }, [refresh]);

  // sesi habis (dari server atau timer idle di klien)
  useEffect(() => {
    const onExpired = () => {
      setMe(null);
      setStatus("expired");
    };
    window.addEventListener(SESSION_EXPIRED_EVENT, onExpired);
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, onExpired);
  }, []);

  // pelacak aktivitas + timer idle
  useEffect(() => {
    if (status !== "authed") return;
    lastActivity.current = Date.now();
    const onActivity = () => {
      lastActivity.current = Date.now();
    };
    ACTIVITY_EVENTS.forEach((ev) => window.addEventListener(ev, onActivity, { passive: true }));

    const timer = window.setInterval(() => {
      const idleMs = (meRef.current?.idleTimeoutSeconds ?? 1800) * 1000;
      const now = Date.now();
      if (now - lastActivity.current >= idleMs) {
        // cabut sesi di server (best effort), lalu tampilkan notifikasi
        void api("/api/auth/logout", { method: "POST", body: {} }).catch(() => undefined);
        window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
        return;
      }
      // ada aktivitas sejak sinkronisasi terakhir -> perpanjang sesi di server
      if (lastActivity.current > lastSync.current && now - lastSync.current >= HEARTBEAT_MIN_GAP_MS) {
        lastSync.current = now;
        void api<Me>("/api/auth/me").catch(() => undefined);
      }
    }, TICK_MS);

    return () => {
      ACTIVITY_EVENTS.forEach((ev) => window.removeEventListener(ev, onActivity));
      window.clearInterval(timer);
    };
  }, [status]);

  const can = useCallback<Ctx["can"]>(
    (module, action = "view") => {
      const p = me?.permissions.find((x) => x.module === module);
      if (!p) return false;
      return action === "view" ? p.canView : action === "edit" ? p.canEdit : action === "approve" ? p.canApprove : p.canDownloadPdf;
    },
    [me],
  );

  const value = useMemo(() => ({ me, status, idleMinutes, refresh, logout, can }), [me, status, idleMinutes, refresh, logout, can]);
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): Ctx {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used within SessionProvider");
  return ctx;
}
