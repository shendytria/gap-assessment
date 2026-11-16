"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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

export default function AppHeader() {
  const { me, logout } = useSession();
  const router = useRouter();

  const [notifs, setNotifs] = useState<AppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [showNotifs, setShowNotifs] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);

  const notifRef = useRef<HTMLDivElement>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);

  const loadNotifications = () => {
    api<{ items: AppNotification[]; unreadCount: number }>("/api/notifications", { background: true })
      .then((res) => {
        setNotifs(res?.items || []);
        setUnreadCount(res?.unreadCount || 0);
      })
      .catch(() => {});
  };

  useEffect(() => {
    if (!me) return;
    loadNotifications();
    const timer = window.setInterval(loadNotifications, 25000);
    return () => window.clearInterval(timer);
  }, [me?.user.id]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (notifRef.current && !notifRef.current.contains(target)) {
        setShowNotifs(false);
      }
      if (userMenuRef.current && !userMenuRef.current.contains(target)) {
        setShowUserMenu(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setShowNotifs(false);
        setShowUserMenu(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  if (!me) return null;

  const handleOpenNotif = async (n: AppNotification) => {
    if (!n.readAt) {
      await api(`/api/notifications/${n.notificationId}/read`, { method: "POST" }).catch(() => {});
      setNotifs((prev) =>
        prev.map((x) =>
          x.notificationId === n.notificationId ? { ...x, readAt: new Date().toISOString() } : x
        )
      );
      setUnreadCount((c) => Math.max(0, c - 1));
    }
    setShowNotifs(false);
    if (n.eventType === "APPROVAL_PENDING") {
      router.push("/approvals");
    } else if (
      n.actionPlanId ||
      n.eventType.startsWith("ACTION_PLAN_") ||
      n.eventType.startsWith("DUE_CHANGE_")
    ) {
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

  const userInitials =
    me.user.initials ||
    me.user.fullName
      .split(" ")
      .map((n) => n[0])
      .slice(0, 2)
      .join("");

  return (
    <header className="app-header">
      {/* Left Spacer */}
      <div className="header-left" />

      {/* Right Actions */}
      <div className="header-actions">
        {/* Site Pill Badge */}
        {me.user.site && (
          <span className="header-site-pill" title={me.user.siteName || me.user.site}>
            <span className="site-pill-dot" />
            {me.user.site}
          </span>
        )}

        {/* Notifications Button & Dropdown */}
        <div ref={notifRef} style={{ position: "relative" }}>
          <button
            type="button"
            className={`header-icon-btn ${unreadCount > 0 ? "has-unread" : ""}`}
            onClick={() => {
              if (!showNotifs) loadNotifications();
              setShowNotifs((v) => !v);
              setShowUserMenu(false);
            }}
            aria-label="Notifications"
            title="Notifications"
          >
            <svg
              viewBox="0 0 24 24"
              width="19"
              height="19"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
              <path d="M13.73 21a2 2 0 0 1-3.46 0" />
            </svg>
            {unreadCount > 0 && (
              <span className="header-notif-badge">
                {unreadCount > 99 ? "99+" : unreadCount}
              </span>
            )}
          </button>

          {showNotifs && (
            <div className="header-dropdown notif-dropdown">
              <div className="dropdown-header">
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <strong>Notifications</strong>
                  {unreadCount > 0 && (
                    <span className="badge badge-warn" style={{ fontSize: "0.72rem", padding: "0.1rem 0.45rem" }}>
                      {unreadCount} new
                    </span>
                  )}
                </div>
                <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                  {unreadCount > 0 && (
                    <button
                      type="button"
                      onClick={handleMarkAllRead}
                      className="header-link-btn"
                    >
                      Mark all read
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setShowNotifs(false)}
                    className="header-close-btn"
                  >
                    ×
                  </button>
                </div>
              </div>

              <div className="dropdown-body">
                {notifs.length === 0 ? (
                  <div className="muted small" style={{ padding: "1.75rem", textAlign: "center" }}>
                    No notifications yet.
                  </div>
                ) : (
                  notifs.map((n) => (
                    <button
                      key={n.notificationId}
                      type="button"
                      onClick={() => handleOpenNotif(n)}
                      className={`notif-item ${!n.readAt ? "unread" : ""}`}
                    >
                      <div className="notif-item-top">
                        <span className="notif-item-title">
                          {!n.readAt && <span className="notif-unread-dot" />}
                          {n.subject}
                        </span>
                      </div>
                      <div className="notif-item-body">{n.body}</div>
                      <div className="notif-item-time">
                        {new Date(n.scheduledAt).toLocaleString([], {
                          day: "2-digit",
                          month: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {/* Divider */}
        <div className="header-sep" />

        {/* User Profile Pill & Menu */}
        <div ref={userMenuRef} style={{ position: "relative" }}>
          <button
            type="button"
            className="header-user-btn"
            onClick={() => {
              setShowUserMenu((v) => !v);
              setShowNotifs(false);
            }}
            aria-label="User menu"
          >
            <div className="header-avatar">{userInitials}</div>
            <div className="header-user-text">
              <div className="header-user-name">{me.user.fullName}</div>
              <div className="header-user-role">{me.user.roleName}</div>
            </div>
            <svg
              className="header-chevron"
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ transform: showUserMenu ? "rotate(180deg)" : "none", transition: "transform 0.15s" }}
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>

          {showUserMenu && (
            <div className="header-dropdown user-dropdown">
              <div className="user-dropdown-header">
                <div style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
                  <div className="header-avatar header-avatar-lg">{userInitials}</div>
                  <div style={{ overflow: "hidden" }}>
                    <div style={{ fontWeight: 700, fontSize: "0.92rem", color: "var(--text)" }}>
                      {me.user.fullName}
                    </div>
                    <div style={{ fontSize: "0.78rem", color: "var(--muted)", wordBreak: "break-all" }}>
                      {me.user.email}
                    </div>
                  </div>
                </div>

                <div style={{ marginTop: "0.65rem", display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
                  <span className="badge badge-info" style={{ fontSize: "0.72rem" }}>
                    {me.user.roleName}
                  </span>
                  {me.user.department && (
                    <span className="badge badge-gray" style={{ fontSize: "0.72rem" }}>
                      Dept: {me.user.department}
                    </span>
                  )}
                  {me.user.site && (
                    <span className="badge badge-gray" style={{ fontSize: "0.72rem" }}>
                      Site: {me.user.site}
                    </span>
                  )}
                </div>
              </div>

              <div className="user-dropdown-body">
                <Link
                  href="/change-password"
                  className="user-dropdown-item"
                  onClick={() => setShowUserMenu(false)}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                  </svg>
                  <span>Change Password</span>
                </Link>

                <div className="user-dropdown-divider" />

                <button
                  type="button"
                  onClick={onLogout}
                  className="user-dropdown-item user-dropdown-item-danger"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                    <polyline points="16 17 21 12 16 7" />
                    <line x1="21" y1="12" x2="9" y2="12" />
                  </svg>
                  <span>Log out</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
