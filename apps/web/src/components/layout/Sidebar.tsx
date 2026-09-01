"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { GraduationCap } from "lucide-react";
import type { Profile } from "@/lib/api";
import {
  orgNavItems,
  otherLoginNavItems,
  parentNavItems,
  schoolNavItems,
  studentNavItems,
  type NavItem,
} from "./nav-config";

export function useCurrentSchool(user: Profile | null) {
  const pathname = usePathname();
  const match = pathname.match(/^\/schools\/([^/]+)/);
  const urlSchoolId = match?.[1];
  const knownSchool = user?.schools.find((s) => s.id === urlSchoolId);
  if (knownSchool) return knownSchool;
  if (urlSchoolId) return { id: urlSchoolId, name: "This school" };
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
      className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
        active ? "bg-accent-soft text-accent" : "text-foreground-soft hover:bg-surface-hover hover:text-foreground"
      }`}
    >
      <Icon className="size-4.5 shrink-0" />
      <span className="truncate">{item.label}</span>
    </Link>
  );
}

// Unlike NavLink, this always opens in a new tab and never renders as
// "active" — it's a jump to an unrelated, unauthenticated login page, not
// in-app navigation, so the Super Admin's own session/tab is untouched.
function NewTabNavLink({ item }: { item: NavItem }) {
  const Icon = item.icon;
  return (
    <a
      href={item.href}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-foreground-soft transition-colors hover:bg-surface-hover hover:text-foreground"
    >
      <Icon className="size-4.5 shrink-0" />
      <span className="truncate">{item.label}</span>
    </a>
  );
}

export function Sidebar({ user, onNavigate }: { user: Profile; onNavigate?: () => void }) {
  const currentSchool = useCurrentSchool(user);
  const schoolItems = currentSchool ? schoolNavItems(user, currentSchool.id) : [];
  const orgItems = orgNavItems(user);
  const parentItems = parentNavItems(user);
  const studentItems = studentNavItems(user);
  const otherLoginItems = otherLoginNavItems(user);

  return (
    <div className="flex h-full flex-col bg-sidebar-bg">
      <div className="flex h-16 shrink-0 items-center gap-2 border-b border-border px-5">
        <div className="flex size-8 items-center justify-center rounded-lg bg-accent text-white">
          <GraduationCap className="size-4.5" />
        </div>
        <span className="truncate font-semibold text-foreground">Ilays Schools</span>
      </div>

      <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-4">
        {currentSchool && schoolItems.length > 0 && (
          <div>
            <p className="px-3 pb-1.5 text-xs font-semibold uppercase tracking-wide text-foreground-muted">
              {currentSchool.name}
            </p>
            <div className="space-y-0.5">
              {schoolItems.map((item) => (
                <NavLink key={item.href} item={item} onNavigate={onNavigate} />
              ))}
            </div>
          </div>
        )}

        {orgItems.length > 0 && (
          <div>
            <p className="px-3 pb-1.5 text-xs font-semibold uppercase tracking-wide text-foreground-muted">
              Organization
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
            <p className="px-3 pb-1.5 text-xs font-semibold uppercase tracking-wide text-foreground-muted">
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
            <p className="px-3 pb-1.5 text-xs font-semibold uppercase tracking-wide text-foreground-muted">
              Student Portal
            </p>
            <div className="space-y-0.5">
              {studentItems.map((item) => (
                <NavLink key={item.href} item={item} onNavigate={onNavigate} />
              ))}
            </div>
          </div>
        )}

        {otherLoginItems.length > 0 && (
          <div>
            <p className="px-3 pb-1.5 text-xs font-semibold uppercase tracking-wide text-foreground-muted">
              Other Logins
            </p>
            <div className="space-y-0.5">
              {otherLoginItems.map((item) => (
                <NewTabNavLink key={item.href} item={item} />
              ))}
            </div>
          </div>
        )}
      </nav>
    </div>
  );
}
