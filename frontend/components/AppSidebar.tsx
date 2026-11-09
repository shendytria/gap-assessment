"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useSession } from "@/lib/session";

export default function AppSidebar({ minimal = false }: { minimal?: boolean }) {
  const { me, logout } = useSession();
  const router = useRouter();
  const pathname = usePathname();

  if (!me) return null;

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
              const isActive = pathname === item.href || (item.href !== "/home" && pathname.startsWith(item.href));
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
      <div className="sidebar-footer">
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
