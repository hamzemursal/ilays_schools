"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { SelectedChildProvider } from "@/features/parent-portal/SelectedChildContext";
import { ChildSwitcher } from "@/features/parent-portal/ChildSwitcher";
import { ChangePasswordForm } from "@/features/auth/ChangePasswordForm";
import { GraduationCap } from "lucide-react";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";

export function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { user, loading } = useAuth();
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    if (!loading && !user) router.push("/portal");
  }, [loading, user, router]);

  if (loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="size-6 animate-spin rounded-full border-2 border-accent border-t-transparent" />
      </div>
    );
  }

  // A temporary-password account (currently only Student Portal accounts,
  // see StudentsService.createPortalAccount) can't reach anything else until
  // this clears — blocks the whole shell, not just one route, since the
  // backend never assumes the frontend enforced this either.
  if (user.mustChangePassword) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface px-4">
        <div className="w-full max-w-sm rounded-xl border border-border bg-background p-6 shadow-sm">
          <div className="mb-5 flex items-center gap-2.5">
            <div className="flex size-9 items-center justify-center rounded-lg bg-accent text-white">
              <GraduationCap className="size-4.5" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">Set your password</p>
              <p className="text-xs text-foreground-muted">One-time step before you continue</p>
            </div>
          </div>
          <ChangePasswordForm forced />
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-surface">
      <aside className="hidden w-64 shrink-0 border-r border-border lg:block">
        <Sidebar user={user} />
      </aside>

      {drawerOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-foreground/30" onClick={() => setDrawerOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-72 max-w-[85%] border-r border-border shadow-lg">
            <button
              onClick={() => setDrawerOpen(false)}
              className="absolute right-3 top-3 rounded-lg p-1.5 text-foreground-soft hover:bg-surface-hover"
              aria-label="Close menu"
            >
              <X className="size-5" />
            </button>
            <Sidebar user={user} onNavigate={() => setDrawerOpen(false)} />
          </div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <Topbar onMenuClick={() => setDrawerOpen(true)} />
        <SelectedChildProvider>
          <main className="flex-1 overflow-y-auto">
            <ChildSwitcher />
            {children}
          </main>
        </SelectedChildProvider>
      </div>
    </div>
  );
}
