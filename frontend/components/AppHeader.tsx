"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useSession } from "@/lib/session";

export default function AppHeader({ minimal = false }: { minimal?: boolean }) {
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
    { label: "Dashboard", href: "/home", visible: hasPerm("DASHBOARD") },
    { label: "Master List", href: "/master-list", visible: hasPerm("MASTER_LIST") },
    { label: "Regulations", href: "/regulations", visible: hasPerm("UPLOAD_REGULATION") },
    { label: "Gap Analysis", href: "/gap-analysis", visible: hasPerm("GAP_ANALYSIS") },
    {
      label: "Approvals",
      href: "/approvals",
      visible: hasPerm("APPROVAL_S1") || hasPerm("APPROVAL_S2") || hasPerm("MONITORING"),
    },
    {
      label: "Execution",
      href: "/execution",
      visible: hasPerm("OUTSTANDING_EXECUTION") || hasPerm("GAP_ANALYSIS"),
    },
    { label: "Audit Trail", href: "/audit-trail", visible: hasPerm("AUDIT_TRAIL") },
    { label: "Settings", href: "/settings", visible: hasPerm("SETTING") },
  ];

  return (
    <header className="topbar">
      <div className="topbar-inner">
        <div style={{ display: "flex", alignItems: "center", gap: "1.5rem", flexWrap: "wrap" }}>
          <Link href="/home" className="brand" aria-label="Gap Assessment Online home" style={{ gap: "0.75rem" }}>
            <img
              src="/logo-kch.png"
              alt="Kalbe Consumer Health"
              style={{ height: "36px", width: "auto", objectFit: "contain" }}
            />
            <span style={{ borderLeft: "1px solid var(--border)", paddingLeft: "0.75rem", fontSize: "0.95rem", fontWeight: 700, color: "var(--text)" }}>
              Gap Assessment Online
            </span>
          </Link>
          {!minimal && (
            <nav>
              <ul className="nav-links">
                {navItems.filter((i) => i.visible).map((item) => {
                  const isActive = pathname === item.href || (item.href !== "/home" && pathname.startsWith(item.href));
                  return (
                    <li key={item.href}>
                      <Link href={item.href} className={`nav-link ${isActive ? "active" : ""}`}>
                        {item.label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </nav>
          )}
        </div>
        <div className="topbar-user">
          <div className="who">
            <strong>{me.user.fullName}</strong>
            <span>{me.user.roleName} ({me.user.site})</span>
          </div>
          {!minimal && (
            <Link href="/change-password" className="btn btn-ghost" style={{ fontSize: "0.825rem", padding: "0 0.6rem" }}>
              Password
            </Link>
          )}
          <button type="button" className="btn btn-ghost" onClick={onLogout} style={{ fontSize: "0.825rem", padding: "0 0.6rem" }}>
            Log out
          </button>
        </div>
      </div>
    </header>
  );
}
