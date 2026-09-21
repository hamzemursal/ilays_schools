"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Bell, Building2, Check, ChevronDown, ChevronRight, Loader2, LogOut, Menu, Search, Settings, X } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { api, type AppNotification, type School } from "@/lib/api";
import { SchoolTypeBadge } from "@/features/my-classes/components/SchoolTypeBadge";
import type { NavItem } from "./nav-config";
import { isNavActive, superAdminNavGroups, superAdminSchoolItems } from "./super-admin-nav";

// The Super Admin's header: organization-level, not school-level. It says
// where in the ORGANIZATION the user is (Organization / Dashboard, or
// Organization / <school> / <page>), offers one search for schools and pages,
// and always carries the school selector - "All Schools" on organization pages
// - so a Super Admin never looks like they are permanently inside one school.
// Rendered by AppShell only for SUPER_ADMIN; other roles keep the shared
// Topbar untouched. Selecting a school reuses the app's existing model (the
// URL is the school context): it just navigates to that school's dashboard.

const STATIC_PAGE_LABELS: Record<string, string> = { "/account": "My Account" };

export function pageLabelFor(pathname: string, items: NavItem[]): string {
  const staticLabel = STATIC_PAGE_LABELS[pathname];
  if (staticLabel) return staticLabel;
  const match = items
    .filter((item) => isNavActive(pathname, item.href))
    .sort((a, b) => b.href.length - a.href.length)[0];
  if (match) return match.label;
  // A school's own landing page (/schools/:id) has no nav entry of its own.
  if (/^\/schools\/[^/]+$/.test(pathname)) return "School overview";
  return "Dashboard";
}

export function SuperAdminTopbar({
  onMenuClick,
  resolvedCurrentSchool,
  schools,
}: {
  onMenuClick: () => void;
  resolvedCurrentSchool: { id: string; name: string; logoUrl: string | null } | null;
  schools: School[] | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, accessToken, logout } = useAuth();

  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [notifOpen, setNotifOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [notifications, setNotifications] = useState<AppNotification[] | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const unreadCount = notifications?.filter((n) => !n.isRead).length ?? 0;

  useEffect(() => {
    if (!accessToken) return;
    api.listMyAppNotifications(accessToken).then(setNotifications).catch(() => setNotifications([]));
    const interval = setInterval(() => {
      api.listMyAppNotifications(accessToken).then(setNotifications).catch(() => undefined);
    }, 60_000);
    return () => clearInterval(interval);
  }, [accessToken]);

  const pages: NavItem[] = useMemo(() => {
    if (!user) return [];
    const groups = superAdminNavGroups(user).flatMap((g) => g.items);
    return [...groups, ...superAdminSchoolItems(user, resolvedCurrentSchool?.id ?? null)];
  }, [user, resolvedCurrentSchool]);

  const q = query.trim().toLowerCase();
  const pageResults = q ? pages.filter((p) => p.label.toLowerCase().includes(q)) : pages;
  const schoolResults = (schools ?? []).filter((s) => (q ? s.name.toLowerCase().includes(q) : true)).slice(0, q ? 8 : 5);

  useEffect(() => {
    if (searchOpen) searchRef.current?.focus();
  }, [searchOpen]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setSearchOpen(true);
      }
      if (e.key === "Escape") {
        setSearchOpen(false);
        setNotifOpen(false);
        setUserMenuOpen(false);
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  if (!user) return null;

  function goTo(href: string) {
    setSearchOpen(false);
    setQuery("");
    router.push(href);
  }

  async function openNotification(n: AppNotification) {
    if (!accessToken) return;
    setNotifOpen(false);
    if (!n.isRead) {
      api
        .markMyAppNotificationRead(accessToken, n.id)
        .then(() => setNotifications((prev) => prev?.map((x) => (x.id === n.id ? { ...x, isRead: true } : x)) ?? prev))
        .catch(() => undefined);
    }
    if (n.actionUrl) router.push(n.actionUrl);
  }

  const label = pageLabelFor(pathname, pages);

  return (
    <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center gap-3 border-b border-border bg-background px-4 sm:px-6">
      <button
        onClick={onMenuClick}
        className="rounded-lg p-2 text-foreground-soft hover:bg-surface-hover lg:hidden"
        aria-label="Open menu"
      >
        <Menu className="size-5" />
      </button>

      <nav aria-label="Breadcrumb" className="hidden min-w-0 items-center gap-1.5 text-sm md:flex">
        <Building2 className="size-4 shrink-0 text-accent" />
        <Link href="/dashboard" className="text-foreground-soft hover:text-foreground">
          Organization
        </Link>
        {resolvedCurrentSchool && (
          <>
            <ChevronRight className="size-3.5 shrink-0 text-foreground-muted" />
            <span className="max-w-[160px] truncate text-foreground-soft">{resolvedCurrentSchool.name}</span>
          </>
        )}
        <ChevronRight className="size-3.5 shrink-0 text-foreground-muted" />
        <span className="truncate font-semibold text-foreground">{label}</span>
      </nav>

      <div className="relative mx-auto min-w-0 flex-1 max-w-xl">
        {searchOpen ? (
          <div className="absolute inset-x-0 top-1/2 z-40 -translate-y-1/2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-foreground-muted" />
              <input
                ref={searchRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search schools and pages…"
                aria-label="Search schools and pages"
                className="w-full rounded-lg border border-accent bg-background py-2 pl-9 pr-9 text-sm text-foreground outline-none ring-2 ring-accent/15"
              />
              <button
                onClick={() => setSearchOpen(false)}
                aria-label="Close search"
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-foreground-muted hover:text-foreground"
              >
                <X className="size-4" />
              </button>
            </div>
            {(schoolResults.length > 0 || pageResults.length > 0) && (
              <div className="mt-1 max-h-80 overflow-y-auto rounded-lg border border-border bg-background py-1 shadow-lg">
                {schoolResults.length > 0 && (
                  <>
                    <p className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-foreground-muted">Schools</p>
                    {schoolResults.map((s) => (
                      <button
                        key={s.id}
                        onClick={() => goTo(`/schools/${s.id}/dashboard`)}
                        className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-foreground hover:bg-surface-hover"
                      >
                        <Building2 className="size-4 text-foreground-muted" />
                        {s.name}
                      </button>
                    ))}
                  </>
                )}
                {pageResults.length > 0 && (
                  <>
                    <p className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-foreground-muted">Pages</p>
                    {pageResults.map((r) => (
                      <button
                        key={r.href}
                        onClick={() => goTo(r.href)}
                        className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-foreground hover:bg-surface-hover"
                      >
                        <r.icon className="size-4 text-foreground-muted" />
                        {r.label}
                      </button>
                    ))}
                  </>
                )}
              </div>
            )}
          </div>
        ) : (
          <button
            onClick={() => setSearchOpen(true)}
            className="flex w-full items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground-muted hover:border-border-strong"
          >
            <Search className="size-4 shrink-0" />
            <span className="hidden truncate sm:inline">Search schools and pages…</span>
            <span className="ml-auto hidden rounded border border-border bg-background px-1.5 py-0.5 text-xs sm:inline">Ctrl K</span>
          </button>
        )}
      </div>

      <div className="ml-auto flex items-center gap-1.5">
        <div className="relative">
          <button
            onClick={() => {
              setNotifOpen((v) => !v);
              setUserMenuOpen(false);
            }}
            className="relative rounded-lg p-2 text-foreground-soft hover:bg-surface-hover"
            aria-label="Notifications"
          >
            <Bell className="size-5" />
            {unreadCount > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex size-4 items-center justify-center rounded-full bg-danger text-[10px] font-semibold text-white">
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            )}
          </button>
          {notifOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setNotifOpen(false)} />
              <div className="absolute right-0 z-50 mt-2 w-80 rounded-xl border border-border bg-background p-4 shadow-lg">
                <p className="text-sm font-semibold text-foreground">Notifications</p>
                {!notifications ? (
                  <p className="mt-2 text-sm text-foreground-soft">Loading…</p>
                ) : notifications.length === 0 ? (
                  <p className="mt-2 text-sm text-foreground-soft">You&apos;re all caught up — nothing new yet.</p>
                ) : (
                  <div className="-mx-4 mt-2 max-h-96 divide-y divide-border overflow-y-auto">
                    {notifications.map((n) => (
                      <button
                        key={n.id}
                        onClick={() => openNotification(n)}
                        className={`block w-full px-4 py-2.5 text-left transition-colors hover:bg-surface-hover ${!n.isRead ? "bg-accent-soft/60" : ""}`}
                      >
                        <p className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                          {!n.isRead && <span className="size-1.5 shrink-0 rounded-full bg-accent" />}
                          {n.title}
                        </p>
                        <p className="mt-0.5 line-clamp-2 text-xs text-foreground-soft">{n.body}</p>
                        <p className="mt-1 text-[11px] text-foreground-muted">{new Date(n.createdAt).toLocaleString()}</p>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        <OrganizationSchoolSelector currentSchoolId={resolvedCurrentSchool?.id ?? null} currentName={resolvedCurrentSchool?.name ?? null} schools={schools} />

        <div className="relative">
          <button
            onClick={() => {
              setUserMenuOpen((v) => !v);
              setNotifOpen(false);
            }}
            aria-label="Account menu"
            aria-haspopup="menu"
            aria-expanded={userMenuOpen}
            className="flex items-center rounded-lg p-1 hover:bg-surface-hover"
          >
            <span className="flex size-9 items-center justify-center rounded-full bg-accent text-xs font-semibold text-white">SA</span>
          </button>
          {userMenuOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setUserMenuOpen(false)} />
              <div className="absolute right-0 z-50 mt-2 w-64 rounded-xl border border-border bg-background p-2 shadow-lg">
                <div className="px-2.5 py-2">
                  <p className="truncate text-sm font-medium text-foreground">{user.email}</p>
                  <p className="mt-0.5 text-xs text-foreground-muted">{user.roles.join(", ") || "No role"}</p>
                </div>
                <div className="my-1 h-px bg-border" />
                <Link
                  href="/account"
                  onClick={() => setUserMenuOpen(false)}
                  className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-foreground-soft hover:bg-surface-hover hover:text-foreground"
                >
                  <Settings className="size-4" />
                  My Account
                </Link>
                <div className="my-1 h-px bg-border" />
                <button
                  onClick={async () => {
                    await logout();
                    router.push("/portal");
                  }}
                  className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-foreground-soft hover:bg-surface-hover hover:text-foreground"
                >
                  <LogOut className="size-4" />
                  Sign out
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

// "All Schools" (the organization) and every school the Super Admin is
// authorized to see. Choosing a school navigates to that school's dashboard -
// the same behaviour the app's original school switcher always had; choosing
// All Schools returns to the organization dashboard. The header shows the
// current choice but the sidebar identity stays "Super Admin / Ilays Schools".
export function OrganizationSchoolSelector({
  currentSchoolId,
  currentName,
  schools,
}: {
  currentSchoolId: string | null;
  currentName: string | null;
  schools: School[] | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const allSelected = currentSchoolId === null;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Switch school context"
        className="flex items-center gap-2 rounded-lg border border-border bg-background px-2.5 py-1.5 text-left hover:bg-surface-hover"
      >
        <Building2 className="size-4 shrink-0 text-accent" />
        <span className="max-w-[120px] truncate text-sm font-medium text-foreground sm:max-w-[180px]">
          {currentSchoolId ? (currentName ?? "This school") : "All Schools"}
        </span>
        <ChevronDown className="size-4 shrink-0 text-foreground-soft" />
      </button>
      {open && (
        <div role="menu" aria-label="Switch school" className="absolute right-0 z-50 mt-2 w-80 rounded-xl border border-border bg-background py-1 shadow-lg">
          <p className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-foreground-muted">Organization</p>
          <button
            type="button"
            role="menuitem"
            aria-current={allSelected ? "true" : undefined}
            onClick={() => {
              setOpen(false);
              if (!allSelected) router.push("/dashboard");
            }}
            className={`flex w-full items-center gap-2.5 border-l-2 px-3 py-2 text-left transition-colors ${
              allSelected ? "border-accent bg-accent-soft" : "border-transparent hover:bg-surface-hover"
            }`}
          >
            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent">
              <Building2 className="size-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium text-foreground">All Schools</span>
              <span className="block text-xs text-foreground-muted">Organization-wide view</span>
            </span>
            {allSelected && <Check className="size-4 shrink-0 text-accent" />}
          </button>

          <div className="my-1 h-px bg-border" />
          <div className="flex items-center justify-between gap-2 px-3 pb-1 pt-1">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-foreground-muted">Schools</p>
            <Link href="/schools" onClick={() => setOpen(false)} className="text-xs font-medium text-accent hover:underline">
              Manage schools
            </Link>
          </div>
          {!schools ? (
            <p className="flex items-center gap-2 px-3 py-2 text-sm text-foreground-muted">
              <Loader2 className="size-4 animate-spin" /> Loading…
            </p>
          ) : schools.length === 0 ? (
            <p className="px-3 py-2 text-sm text-foreground-muted">No authorized schools yet.</p>
          ) : (
            <div className="max-h-72 overflow-y-auto">
              {schools.map((s) => {
                const selected = s.id === currentSchoolId;
                return (
                  <button
                    key={s.id}
                    type="button"
                    role="menuitem"
                    aria-current={selected ? "true" : undefined}
                    onClick={() => {
                      setOpen(false);
                      if (!selected) router.push(`/schools/${s.id}/dashboard`);
                    }}
                    className={`flex w-full items-center gap-2.5 border-l-2 px-3 py-2 text-left transition-colors ${
                      selected ? "border-accent bg-accent-soft" : "border-transparent hover:bg-surface-hover"
                    }`}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-foreground">{s.name}</span>
                      <span className="block text-xs text-foreground-muted">
                        {s.studentCount} {s.studentCount === 1 ? "student" : "students"} · {s.teacherCount} {s.teacherCount === 1 ? "teacher" : "teachers"} · {s.staffCount} staff
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-2">
                      <SchoolTypeBadge type={s.type} />
                      {selected && <Check className="size-4 shrink-0 text-accent" />}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
