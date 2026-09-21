"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { GraduationCap, LogOut } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import type { Profile } from "@/lib/api";
import type { NavItem } from "./nav-config";
import { isNavActive, superAdminNavGroups, superAdminSchoolItems } from "./super-admin-nav";

// The Super Admin's sidebar: the organization's own identity ("Ilays
// Schools" - never a selected school's name or logo), on a deep navy rail with
// Indigo marking the active page. Rendered by AppShell only for the
// SUPER_ADMIN role; every other role keeps the shared Sidebar untouched.
// Navigation entries come from super-admin-nav (built from nav-config), so
// no route is declared here.
function NavLink({ item, onNavigate }: { item: NavItem; onNavigate?: () => void }) {
  const pathname = usePathname();
  const active = isNavActive(pathname, item.href);
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sa-cyan/60 ${
        active ? "bg-accent text-white shadow-sm" : "text-slate-300 hover:bg-white/5 hover:text-white"
      }`}
    >
      <Icon className={`size-4.5 shrink-0 ${active ? "text-white" : "text-slate-400"}`} />
      <span className="truncate">{item.label}</span>
    </Link>
  );
}

function NavSection({ label, items, onNavigate }: { label: string; items: NavItem[]; onNavigate?: () => void }) {
  return (
    <div>
      <p className="px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">{label}</p>
      <div className="space-y-0.5">
        {items.map((item) => (
          <NavLink key={item.href} item={item} onNavigate={onNavigate} />
        ))}
      </div>
    </div>
  );
}

export function SuperAdminSidebar({
  user,
  resolvedCurrentSchool,
  onNavigate,
}: {
  user: Profile;
  resolvedCurrentSchool: { id: string; name: string; logoUrl: string | null } | null;
  onNavigate?: () => void;
}) {
  const router = useRouter();
  const { logout } = useAuth();
  const groups = superAdminNavGroups(user);
  const schoolItems = superAdminSchoolItems(user, resolvedCurrentSchool?.id ?? null);
  const [overview, ...rest] = groups;

  return (
    <div className="flex h-full flex-col bg-sa-navy text-slate-300">
      <div className="shrink-0 border-b border-white/10 px-4 py-4">
        <div className="flex items-center gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent text-white shadow-sm">
            <GraduationCap className="size-5" />
          </div>
          <div className="min-w-0">
            <p className="truncate text-base font-semibold leading-tight text-white">Ilays Schools</p>
            <span className="mt-1 inline-block rounded bg-accent/25 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-indigo-200">
              Super Admin
            </span>
          </div>
        </div>
        <p className="mt-2.5 text-xs text-slate-400">Organization Control Center</p>
      </div>

      <nav aria-label="Organization navigation" className="flex-1 space-y-6 overflow-y-auto px-3 py-4">
        {overview && <NavSection label={overview.label} items={overview.items} onNavigate={onNavigate} />}

        {resolvedCurrentSchool && schoolItems.length > 0 && (
          <NavSection label={`Selected school · ${resolvedCurrentSchool.name}`} items={schoolItems} onNavigate={onNavigate} />
        )}

        {rest.map((group) => (
          <NavSection key={group.label} label={group.label} items={group.items} onNavigate={onNavigate} />
        ))}
      </nav>

      <div className="shrink-0 space-y-1 border-t border-white/10 p-3">
        <Link
          href="/account"
          onClick={onNavigate}
          className="flex items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sa-cyan/60"
        >
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-semibold text-white">
            SA
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium text-white">Super Admin</span>
            <span className="block truncate text-xs text-slate-400">Organization Administrator</span>
          </span>
        </Link>
        <button
          type="button"
          onClick={async () => {
            await logout();
            router.push("/portal");
          }}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-slate-300 transition-colors hover:bg-white/5 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sa-cyan/60"
        >
          <LogOut className="size-4.5 shrink-0 text-slate-400" />
          Log out
        </button>
      </div>
    </div>
  );
}
