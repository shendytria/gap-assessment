"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { SessionProvider, useSession } from "@/lib/session";
import AppSidebar from "@/components/AppSidebar";
import AppHeader from "@/components/AppHeader";
import SessionExpiredDialog from "@/components/SessionExpiredDialog";

function Guard({ children }: { children: React.ReactNode }) {
  const { me, status, idleMinutes, can } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const mustChange = !!me?.passwordChangeReason;

  const isRouteAllowed = (() => {
    if (!me || mustChange) return true;
    if (pathname === "/regulations" || pathname.startsWith("/regulations/")) {
      return can("UPLOAD_REGULATION", "view");
    }
    if (pathname === "/gap-analysis") {
      return can("GAP_ANALYSIS", "view");
    }
    if (pathname === "/approvals" || pathname.startsWith("/approvals/")) {
      return can("APPROVAL_S1", "view") || can("APPROVAL_S2", "view") || can("MONITORING", "view");
    }
    if (pathname === "/execution" || pathname.startsWith("/execution/")) {
      return can("OUTSTANDING_EXECUTION", "view") || can("GAP_ANALYSIS", "view");
    }
    if (pathname === "/audit-trail" || pathname.startsWith("/audit-trail/")) {
      return can("AUDIT_TRAIL", "view");
    }
    if (pathname === "/settings" || pathname.startsWith("/settings/")) {
      return can("SETTING", "view");
    }
    return true;
  })();

  useEffect(() => {
    if (status === "anon") router.replace("/login");
    else if (status === "authed" && mustChange && pathname !== "/change-password") router.replace("/change-password");
    else if (status === "authed" && !mustChange && !isRouteAllowed) router.replace("/home");
  }, [status, mustChange, isRouteAllowed, pathname, router]);

  if (status === "expired") return <SessionExpiredDialog minutes={idleMinutes} />;
  if (status !== "authed" || (mustChange && pathname !== "/change-password") || (!mustChange && !isRouteAllowed)) {
    return (
      <div className="splash" role="status" aria-live="polite">
        <span className="spinner" aria-hidden="true" /> Loading…
      </div>
    );
  }
  return (
    <div className="app-shell">
      <AppSidebar minimal={mustChange} />
      <div className="app-main">
        {!mustChange && <AppHeader />}
        {children}
      </div>
    </div>
  );
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <Guard>{children}</Guard>
    </SessionProvider>
  );
}
