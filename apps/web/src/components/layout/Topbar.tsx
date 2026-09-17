"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowRight,
  Bell,
  Check,
  ChevronDown,
  GraduationCap,
  KeyRound,
  Loader2,
  LogOut,
  Menu,
  Search,
  Settings,
  UserCircle,
  X,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { Avatar } from "@/components/ui/Avatar";
import { api, type AppNotification, type School, type SchoolType } from "@/lib/api";
import { contextRoleLabel } from "./Sidebar";
import { orgNavItems, schoolNavItems, type NavItem } from "./nav-config";
import { SchoolTypeBadge } from "@/features/my-classes/components/SchoolTypeBadge";
import { DECORATIVE_TONE_PARTS } from "@/components/ui/decorativeTones";

export function Topbar({
  onMenuClick,
  canSwitchSchools,
  resolvedCurrentSchool,
  schools,
}: {
  onMenuClick: () => void;
  canSwitchSchools: boolean;
  resolvedCurrentSchool: { id: string; name: string; logoUrl: string | null } | null;
  schools: School[] | null;
}) {
  const router = useRouter();
  const { user, accessToken, logout } = useAuth();
  // The school-context switcher only ever makes sense once a Super Admin
  // has actually entered a specific school's workspace — on the
  // organization-level pages (Dashboard, Schools) there is no "current
  // school" to show or switch from, so the header stays clean there
  // (search + notifications only), exactly like a School Admin's header
  // always does.
  const showSwitcher = canSwitchSchools && !!resolvedCurrentSchool;

  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifications, setNotifications] = useState<AppNotification[] | null>(null);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const unreadCount = notifications?.filter((n) => !n.isRead).length ?? 0;

  useEffect(() => {
    if (!accessToken) return;
    api.listMyAppNotifications(accessToken).then(setNotifications).catch(() => setNotifications([]));
    // Light polling, not a live socket — a new submit/return/approve/publish
    // is rare enough that a minute's staleness on the Bell is a non-issue.
    const interval = setInterval(() => {
      api.listMyAppNotifications(accessToken).then(setNotifications).catch(() => undefined);
    }, 60_000);
    return () => clearInterval(interval);
  }, [accessToken]);

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

  const navItems: NavItem[] = useMemo(() => {
    if (!user) return [];
    const school = resolvedCurrentSchool ? schoolNavItems(user, resolvedCurrentSchool.id) : [];
    return [...school, ...orgNavItems(user)];
  }, [user, resolvedCurrentSchool]);

  const results = useMemo(() => {
    if (!query.trim()) return navItems;
    const q = query.trim().toLowerCase();
    return navItems.filter((n) => n.label.toLowerCase().includes(q));
  }, [navItems, query]);

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

  return (
    <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center gap-3 border-b border-accent/15 bg-accent-soft/90 px-4 backdrop-blur sm:px-6">
      <button
        onClick={onMenuClick}
        className="rounded-lg p-2 text-foreground-soft hover:bg-surface-hover lg:hidden"
        aria-label="Open menu"
      >
        <Menu className="size-5" />
      </button>

      {showSwitcher && resolvedCurrentSchool && (
        <SchoolContextSwitcher
          currentSchoolId={resolvedCurrentSchool.id}
          fallbackName={resolvedCurrentSchool.name}
          roleLabel={contextRoleLabel(user.roles)}
          schools={schools}
        />
      )}

      <div className="relative flex-1 max-w-md">
        {searchOpen ? (
          <div className="absolute inset-x-0 top-0 z-40">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-foreground-muted" />
              <input
                ref={searchRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Jump to a page…"
                className="w-full rounded-lg border border-accent bg-background py-2 pl-9 pr-9 text-sm text-foreground outline-none ring-2 ring-accent/15"
              />
              <button
                onClick={() => setSearchOpen(false)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-foreground-muted hover:text-foreground"
              >
                <X className="size-4" />
              </button>
            </div>
            {results.length > 0 && (
              <div className="mt-1 max-h-72 overflow-y-auto rounded-lg border border-border bg-background py-1 shadow-lg">
                {results.map((r) => (
                  <button
                    key={r.href}
                    onClick={() => goTo(r.href)}
                    className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-foreground hover:bg-surface-hover"
                  >
                    <r.icon className="size-4 text-foreground-muted" />
                    {r.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <button
            onClick={() => setSearchOpen(true)}
            className="flex w-full max-w-xs items-center gap-2 rounded-lg border border-border bg-surface-soft px-3 py-2 text-sm text-foreground-muted hover:border-border-strong"
          >
            <Search className="size-4" />
            <span className="hidden sm:inline">Jump to a page…</span>
            <span className="ml-auto hidden rounded border border-border bg-background px-1.5 py-0.5 text-xs sm:inline">
              Ctrl K
            </span>
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
                  <div className="mt-2 -mx-4 max-h-96 divide-y divide-border overflow-y-auto">
                    {notifications.map((n) => (
                      <button
                        key={n.id}
                        onClick={() => openNotification(n)}
                        className={`block w-full px-4 py-2.5 text-left transition-colors hover:bg-surface-hover ${!n.isRead ? "bg-accent-soft/40" : ""}`}
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

        <div className="relative">
          <button
            onClick={() => {
              setUserMenuOpen((v) => !v);
              setNotifOpen(false);
            }}
            aria-label="Account menu"
            className="flex items-center gap-2 rounded-lg p-1.5 hover:bg-surface-hover"
          >
            <Avatar name={user.email} size="sm" />
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
                {user.roles.includes("STUDENT") && (
                  <>
                    <Link
                      href="/student/profile"
                      onClick={() => setUserMenuOpen(false)}
                      className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-foreground-soft hover:bg-surface-hover hover:text-foreground"
                    >
                      <UserCircle className="size-4" />
                      My Profile
                    </Link>
                    <Link
                      href="/student/change-password"
                      onClick={() => setUserMenuOpen(false)}
                      className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-foreground-soft hover:bg-surface-hover hover:text-foreground"
                    >
                      <KeyRound className="size-4" />
                      Change Password
                    </Link>
                    <div className="my-1 h-px bg-border" />
                  </>
                )}
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

// A small, subtly-tinted icon square per school row — Primary reuses the
// same blue accent tone as SchoolTypeBadge's own Primary badge, Secondary
// the same violet tone as its Secondary badge (see decorativeTones.ts),
// so a school's color story is consistent between the badge and its icon
// rather than inventing a second palette.
function schoolIconTone(type: SchoolType): { soft: string; text: string } {
  if (type === "SECONDARY") return DECORATIVE_TONE_PARTS.violet;
  return { soft: "bg-accent-soft", text: "text-accent" };
}

// The header's "which school am I looking at" control — only ever rendered
// (see Topbar's showSwitcher) once Super Admin has actually entered a
// specific school's workspace; the organization-level pages (Dashboard,
// Schools) have no "current school" to show or switch from, so this never
// mounts there. `schools` is the actor-scoped list AppShell already fetched
// once for both Sidebar and Topbar to share — never fetched again here, so
// opening this dropdown never issues a second request for the same data.
// Reuses the URL-is-the-context model everywhere else in this app already
// relies on (see Sidebar's useCurrentSchool) — picking a school just
// navigates there, no separate stored "selected school" state.
function SchoolContextSwitcher({
  currentSchoolId,
  fallbackName,
  roleLabel,
  schools,
}: {
  currentSchoolId: string;
  fallbackName: string;
  roleLabel: string;
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

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Switch school context"
        className="flex items-center gap-1.5 rounded-lg px-1.5 py-1 text-left hover:bg-surface-hover"
      >
        <span className="flex min-w-0 flex-col leading-tight">
          <span className="max-w-[140px] truncate font-semibold text-foreground sm:max-w-[220px]">{fallbackName}</span>
          <span className="text-[10px] font-semibold uppercase tracking-wide text-foreground-muted">
            {roleLabel} · Current school
          </span>
        </span>
        <ChevronDown className="size-4 shrink-0 text-foreground-soft" />
      </button>
      {open && (
        <div
          role="menu"
          aria-label="Switch school"
          className="absolute left-0 z-50 mt-2 w-80 rounded-xl border border-border bg-background py-1 shadow-lg"
        >
          <div className="flex items-center justify-between gap-2 px-3 py-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-foreground-muted">Switch school</p>
            <Link
              href="/schools"
              onClick={() => setOpen(false)}
              className="inline-flex items-center gap-1 text-xs font-medium text-accent hover:underline"
            >
              View All Schools <ArrowRight className="size-3" />
            </Link>
          </div>
          <div className="my-1 h-px bg-border" />
          {!schools ? (
            <p className="flex items-center gap-2 px-3 py-2 text-sm text-foreground-muted">
              <Loader2 className="size-4 animate-spin" /> Loading…
            </p>
          ) : schools.length === 0 ? (
            <p className="px-3 py-2 text-sm text-foreground-muted">No authorized schools yet.</p>
          ) : (
            schools.map((s) => {
              const selected = s.id === currentSchoolId;
              const tone = schoolIconTone(s.type);
              return (
                <button
                  key={s.id}
                  type="button"
                  role="menuitem"
                  aria-current={selected ? "true" : undefined}
                  onClick={() => {
                    setOpen(false);
                    if (s.id !== currentSchoolId) router.push(`/schools/${s.id}/dashboard`);
                  }}
                  className={`flex w-full items-center gap-2.5 border-l-2 px-3 py-2 text-left transition-colors ${
                    selected ? "border-accent bg-accent-soft/50" : "border-transparent hover:bg-surface-hover"
                  }`}
                >
                  <span className={`flex size-8 shrink-0 items-center justify-center rounded-lg ${tone.soft} ${tone.text}`}>
                    <GraduationCap className="size-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-foreground">{s.name}</span>
                    <span className="block text-xs text-foreground-muted">
                      {s.studentCount} students · {s.teacherCount} teachers · {s.staffCount} staff
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    <SchoolTypeBadge type={s.type} />
                    {selected && <Check className="size-4 shrink-0 text-accent" />}
                  </span>
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

