"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useSession } from "@/lib/session";
import { api } from "@/lib/api";

type AppNotification = {
  notificationId: number;
  eventType: string;
  gapId: number | null;
  actionPlanId: number | null;
  subject: string;
  body: string;
  scheduledAt: string;
  readAt: string | null;
};

export default function AppSidebar({ minimal = false }: { minimal?: boolean }) {
  const { me, logout } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const [notifs, setNotifs] = useState<AppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [showNotifs, setShowNotifs] = useState(false);

  const loadNotifications = () => {
    api<{ items: AppNotification[]; unreadCount: number }>("/api/notifications", { background: true })
      .then((res) => {
        setNotifs(res?.items || []);
        setUnreadCount(res?.unreadCount || 0);
      })
      .catch(() => {});
  };

  useEffect(() => {
    if (!me || minimal) return;
    loadNotifications();
    const timer = window.setInterval(loadNotifications, 25000);
    return () => window.clearInterval(timer);
  }, [me?.user.id, minimal]);

  if (!me) return null;

  const handleOpenNotif = async (n: AppNotification) => {
    if (!n.readAt) {
      await api(`/api/notifications/${n.notificationId}/read`, { method: "POST" }).catch(() => {});
      setNotifs((prev) =>
        prev.map((x) => (x.notificationId === n.notificationId ? { ...x, readAt: new Date().toISOString() } : x))
      );
      setUnreadCount((c) => Math.max(0, c - 1));
    }
    setShowNotifs(false);
    if (n.eventType === "APPROVAL_PENDING") {
      router.push("/approvals");
    } else if (n.actionPlanId || n.eventType.startsWith("ACTION_PLAN_") || n.eventType.startsWith("DUE_CHANGE_")) {
      router.push("/execution");
    } else if (n.gapId) {
      router.push(`/gap-analysis/${n.gapId}`);
    }
  };

  const handleMarkAllRead = async () => {
    await api("/api/notifications/read-all", { method: "POST" }).catch(() => {});
    const nowIso = new Date().toISOString();
    setNotifs((prev) => prev.map((x) => ({ ...x, readAt: x.readAt || nowIso })));
    setUnreadCount(0);
  };

  const onLogout = async () => {
    await logout();
    router.replace("/login");
  };

  const hasPerm = (mod: string) => me.permissions.some((p) => p.module === mod && p.canView);

  const navItems = [
    {
      label: "Dashboard",
      href: "/home",
      visible: hasPerm("DASHBOARD"),
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="sidebar-item-icon">
          <rect x="3" y="3" width="7" height="7" />
          <rect x="14" y="3" width="7" height="7" />
          <rect x="14" y="14" width="7" height="7" />
          <rect x="3" y="14" width="7" height="7" />
        </svg>
      ),
    },
    {
      label: "Master List",
      href: "/master-list",
      visible: hasPerm("MASTER_LIST"),
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="sidebar-item-icon">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="16" y1="13" x2="8" y2="13" />
          <line x1="16" y1="17" x2="8" y2="17" />
          <polyline points="10 9 9 9 8 9" />
        </svg>
      ),
    },
    {
      label: "Regulations",
      href: "/regulations",
      visible: hasPerm("UPLOAD_REGULATION"),
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="sidebar-item-icon">
          <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
          <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
        </svg>
      ),
    },
    {
      label: "Gap Analysis",
      href: "/gap-analysis",
      visible: hasPerm("GAP_ANALYSIS"),
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="sidebar-item-icon">
          <line x1="18" y1="20" x2="18" y2="10" />
          <line x1="12" y1="20" x2="12" y2="4" />
          <line x1="6" y1="20" x2="6" y2="14" />
        </svg>
      ),
    },
    {
      label: "Approvals",
      href: "/approvals",
      visible: hasPerm("APPROVAL_S1") || hasPerm("APPROVAL_S2") || hasPerm("MONITORING"),
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="sidebar-item-icon">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          <polyline points="9 12 11 14 15 10" />
        </svg>
      ),
    },
    {
      label: "Execution",
      href: "/execution",
      visible: hasPerm("OUTSTANDING_EXECUTION") || hasPerm("GAP_ANALYSIS"),
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="sidebar-item-icon">
          <polyline points="9 11 12 14 22 4" />
          <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
        </svg>
      ),
    },
    {
      label: "Audit Trail",
      href: "/audit-trail",
      visible: hasPerm("AUDIT_TRAIL"),
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="sidebar-item-icon">
          <circle cx="12" cy="12" r="10" />
          <polyline points="12 6 12 12 16 14" />
        </svg>
      ),
    },
    {
      label: "Settings",
      href: "/settings",
      visible: hasPerm("SETTING"),
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="sidebar-item-icon">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
      ),
    },
  ];

  const userInitials = me.user.initials || me.user.fullName.split(" ").map((n) => n[0]).slice(0, 2).join("");

  return (
    <aside className="app-sidebar">
      {/* Brand Header */}
      <div className="sidebar-header">
        <Link href="/home" className="sidebar-brand">
          <img
            src="/logo-kch.png"
            alt="Kalbe Consumer Health"
            style={{ height: "42px", width: "auto", objectFit: "contain" }}
          />
        </Link>
        <div className="sidebar-brand-title">Gap Assessment Online</div>
      </div>

      {/* Nav Items */}
      {!minimal && (
        <nav style={{ flex: 1, overflowY: "auto" }}>
          <ul className="sidebar-nav">
            {navItems.filter((i) => i.visible).map((item) => {
              const isActive =
                pathname === item.href ||
                (item.href !== "/home" && item.href !== "/gap-analysis" && pathname.startsWith(item.href));
              return (
                <li key={item.href}>
                  <Link href={item.href} className={`sidebar-item ${isActive ? "active" : ""}`}>
                    {item.icon}
                    <span>{item.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      )}

      {/* User Card at bottom of sidebar */}
      <div className="sidebar-footer" style={{ position: "relative" }}>
        {!minimal && (
          <div style={{ marginBottom: "0.65rem" }}>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => {
                if (!showNotifs) loadNotifications();
                setShowNotifs((v) => !v);
              }}
              style={{
                width: "100%",
                justifyContent: "space-between",
                padding: "0.45rem 0.65rem",
                fontSize: "0.82rem",
                border: "1px solid var(--border)",
                borderRadius: "8px",
                background: unreadCount > 0 ? "#fefce8" : "var(--surface)",
              }}
            >
              <span style={{ display: "inline-flex", alignItems: "center", gap: "0.45rem", fontWeight: 600 }}>
                <span aria-hidden="true">🔔</span> Notifications
              </span>
              {unreadCount > 0 ? (
                <span
                  style={{
                    background: "#c52a2a",
                    color: "#fff",
                    borderRadius: "999px",
                    padding: "0.08rem 0.45rem",
                    fontSize: "0.72rem",
                    fontWeight: 700,
                  }}
                >
                  {unreadCount}
                </span>
              ) : (
                <span className="muted" style={{ fontSize: "0.75rem" }}>0</span>
              )}
            </button>

            {showNotifs && (
              <div
                style={{
                  position: "fixed",
                  left: "252px",
                  bottom: "1.25rem",
                  width: "360px",
                  maxHeight: "420px",
                  background: "#fff",
                  border: "1px solid var(--border)",
                  borderRadius: "12px",
                  boxShadow: "0 16px 36px rgba(15, 23, 42, 0.2)",
                  zIndex: 9999,
                  display: "flex",
                  flexDirection: "column",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    padding: "0.7rem 0.9rem",
                    borderBottom: "1px solid var(--border)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    background: "var(--surface-2)",
                  }}
                >
                  <strong style={{ fontSize: "0.875rem" }}>Notifications ({unreadCount} unread)</strong>
                  <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                    {unreadCount > 0 && (
                      <button
                        type="button"
                        onClick={handleMarkAllRead}
                        style={{ background: "none", border: "none", color: "var(--brand)", fontSize: "0.75rem", fontWeight: 600, cursor: "pointer" }}
                      >
                        Mark all read
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setShowNotifs(false)}
                      style={{ background: "none", border: "none", fontSize: "1rem", cursor: "pointer", lineHeight: 1 }}
                    >
                      ×
                    </button>
                  </div>
                </div>
                <div style={{ overflowY: "auto", maxHeight: "360px" }}>
                  {notifs.length === 0 ? (
                    <div className="muted small" style={{ padding: "1.25rem", textAlign: "center" }}>
                      Belum ada notifikasi.
                    </div>
                  ) : (
                    notifs.map((n) => (
                      <button
                        key={n.notificationId}
                        type="button"
                        onClick={() => handleOpenNotif(n)}
                        style={{
                          width: "100%",
                          textAlign: "left",
                          padding: "0.7rem 0.9rem",
                          border: "none",
                          borderBottom: "1px solid var(--border)",
                          background: n.readAt ? "#fff" : "#f0fdf4",
                          cursor: "pointer",
                          display: "block",
                        }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", gap: "0.5rem", marginBottom: "0.2rem" }}>
                          <span style={{ fontWeight: n.readAt ? 600 : 700, fontSize: "0.8rem", color: "#0f172a" }}>
                            {!n.readAt && <span style={{ color: "#15803d", marginRight: "0.3rem" }}>●</span>}
                            {n.subject}
                          </span>
                        </div>
                        <div style={{ fontSize: "0.76rem", color: "#475569", lineHeight: 1.35, marginBottom: "0.25rem" }}>
                          {n.body}
                        </div>
                        <div style={{ fontSize: "0.7rem", color: "#94a3b8" }}>
                          {new Date(n.scheduledAt).toLocaleString()}
                        </div>
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        )}
        <div className="sidebar-user">
          <div className="user-avatar">{userInitials}</div>
          <div className="user-info">
            <div className="user-name">{me.user.fullName}</div>
            <div className="user-role">{me.user.roleName} ({me.user.site})</div>
          </div>
        </div>

        <div className="sidebar-actions">
          {!minimal && (
            <Link href="/change-password" className="btn btn-ghost">
              Password
            </Link>
          )}
          <button type="button" className="btn btn-ghost" onClick={onLogout}>
            Log out
          </button>
        </div>
      </div>
    </aside>
  );
}
