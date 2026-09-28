"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { GraduationCap } from "lucide-react";
import type { Profile } from "@/lib/api";
import { SchoolBrandingEditor } from "./SchoolBrandingEditor";
import { orgNavItems, parentNavItems, schoolNavItems, studentNavItems, type NavItem } from "./nav-config";

// The role label shown under "Ilays Schools" for an org-wide viewer — Super
// Admin and Organization Admin get their own explicit label; every other
// schools.view holder (Central Finance/HR viewers) gets a generic one
// rather than a guess at which of their several roles is "the" one worth
// naming. Shared with Topbar's own context label for the same reason: one
// definition, used everywhere this distinction is shown.
export function contextRoleLabel(roles: string[]): string {
  if (roles.includes("SUPER_ADMIN")) return "Super Admin";
  if (roles.includes("ORGANIZATION_ADMIN")) return "Org Admin";
  return "Admin";
}

export function useCurrentSchool(user: Profile | null) {
  const pathname = usePathname();
  const match = pathname.match(/^\/schools\/([^/]+)/);
  const urlSchoolId = match?.[1];
  const knownSchool = user?.schools.find((s) => s.id === urlSchoolId);
  if (knownSchool) return knownSchool;
  if (urlSchoolId) return { id: urlSchoolId, name: "This school", logoUrl: null };
  return user?.schools[0] ?? null;
}

function NavLink({ item, onNavigate }: { item: NavItem; onNavigate?: () => void }) {
  const pathname = usePathname();
  const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 ${
        active ? "bg-accent text-white shadow-sm" : "text-foreground-soft hover:bg-accent-soft/60 hover:text-accent"
      }`}
    >
      <Icon className={`size-4.5 shrink-0 ${active ? "text-white" : "text-foreground-muted"}`} />
      <span className="truncate">{item.label}</span>
    </Link>
  );
}

export function Sidebar({
  user,
  accessToken,
  canSwitchSchools,
  resolvedCurrentSchool,
  onBrandingChanged,
  onNavigate,
}: {
  user: Profile;
  accessToken: string | null;
  // Org-wide reach (Super Admin, Organization Admin, or a Central
  // Finance/HR viewer) — decides which identity this sidebar shows: the
  // organization's own brand, never a selected school's, per the product
  // rule that a Super Admin's identity is "Ilays Schools," not whichever
  // school they happen to be looking at.
  canSwitchSchools: boolean;
  resolvedCurrentSchool: { id: string; name: string; logoUrl: string | null } | null;
  onBrandingChanged: () => Promise<void>;
  onNavigate?: () => void;
}) {
  const schoolItems = resolvedCurrentSchool ? schoolNavItems(user, resolvedCurrentSchool.id) : [];
  const orgItems = orgNavItems(user);
  const parentItems = parentNavItems(user);
  const studentItems = studentNavItems(user);
  const canManageBranding = !!accessToken && !canSwitchSchools && !!resolvedCurrentSchool && user.permissions.includes("settings.manage");

  return (
    <div className="flex h-full flex-col bg-sidebar-bg">
      <div className="mx-3 flex h-[76px] shrink-0 items-center gap-3 border-b border-border px-2">
        {canSwitchSchools ? (
          <>
            <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent text-white">
              <GraduationCap className="size-4.5" />
            </div>
            <div className="min-w-0">
              <p className="truncate text-base font-semibold text-accent">Ilays Schools</p>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-accent">{contextRoleLabel(user.roles)}</p>
            </div>
          </>
        ) : resolvedCurrentSchool && accessToken ? (
          <>
            <SchoolBrandingEditor
              accessToken={accessToken}
              schoolId={resolvedCurrentSchool.id}
              logoUrl={resolvedCurrentSchool.logoUrl}
              editable={canManageBranding}
              onChanged={onBrandingChanged}
            />
            <div className="min-w-0">
              <p className="truncate text-base font-semibold text-accent">{resolvedCurrentSchool.name}</p>
              <p className="truncate text-[11px] text-foreground-muted">School Management System</p>
            </div>
          </>
        ) : (
          <>
            <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent text-white">
              <GraduationCap className="size-4.5" />
            </div>
            <p className="min-w-0 truncate text-sm font-semibold text-foreground">Ilays Schools</p>
          </>
        )}
      </div>

      <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-5">
        {resolvedCurrentSchool && schoolItems.length > 0 && (
          <div>
            <p className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-wider text-foreground-muted">Main menu</p>
            <div className="space-y-0.5">
              {schoolItems.map((item) => (
                <NavLink key={item.href} item={item} onNavigate={onNavigate} />
              ))}
            </div>
          </div>
        )}

        {orgItems.length > 0 && (
          <div>
            <p className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-wider text-foreground-muted">
              {resolvedCurrentSchool && schoolItems.length > 0 ? "Organization" : "Main menu"}
            </p>
            <div className="space-y-0.5">
              {orgItems.map((item) => (
                <NavLink key={item.href} item={item} onNavigate={onNavigate} />
              ))}
            </div>
          </div>
        )}

        {parentItems.length > 0 && (
          <div>
            <p className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-wider text-foreground-muted">
              Parent Portal
            </p>
            <div className="space-y-0.5">
              {parentItems.map((item) => (
                <NavLink key={item.href} item={item} onNavigate={onNavigate} />
              ))}
            </div>
          </div>
        )}

        {studentItems.length > 0 && (
          <div>
            <p className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-wider text-foreground-muted">
              Student Portal
            </p>
            <div className="space-y-0.5">
              {studentItems.map((item) => (
                <NavLink key={item.href} item={item} onNavigate={onNavigate} />
              ))}
            </div>
          </div>
        )}
      </nav>
    </div>
  );
}
