"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { SessionProvider, useSession } from "@/lib/session";
import AppSidebar from "@/components/AppSidebar";
import SessionExpiredDialog from "@/components/SessionExpiredDialog";

function Guard({ children }: { children: React.ReactNode }) {
  const { me, status, idleMinutes } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const mustChange = !!me?.passwordChangeReason;

  useEffect(() => {
    if (status === "anon") router.replace("/login");
    else if (status === "authed" && mustChange && pathname !== "/change-password") router.replace("/change-password");
  }, [status, mustChange, pathname, router]);

  if (status === "expired") return <SessionExpiredDialog minutes={idleMinutes} />;
  if (status !== "authed" || (mustChange && pathname !== "/change-password")) {
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
