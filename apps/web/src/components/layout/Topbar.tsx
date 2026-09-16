"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowRight,
  Bell,
  Camera,
  Check,
  ChevronDown,
  GraduationCap,
  KeyRound,
  Loader2,
  LogOut,
  Menu,
  Search,
  Settings,
  Trash2,
  UserCircle,
  X,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { Avatar } from "@/components/ui/Avatar";
import { useToast } from "@/components/ui/Toast";
import { api, type AppNotification, type School, type SchoolType } from "@/lib/api";
import { useCurrentSchool } from "./Sidebar";
import { orgNavItems, schoolNavItems, type NavItem } from "./nav-config";
import { SchoolTypeBadge } from "@/features/my-classes/components/SchoolTypeBadge";
import { DECORATIVE_TONE_PARTS } from "@/components/ui/decorativeTones";

// The role label shown in the context block's "{LABEL} · CURRENT SCHOOL"
// subtitle — Super Admin and Organization Admin get their own explicit
// label; every other schools.view holder (Central Finance/HR viewers) gets
// a generic one rather than a guess at which of their several roles is
// "the" one worth naming.
function contextRoleLabel(roles: string[]): string {
  if (roles.includes("SUPER_ADMIN")) return "Super Admin";
  if (roles.includes("ORGANIZATION_ADMIN")) return "Org Admin";
  return "Admin";
}

export function Topbar({ onMenuClick }: { onMenuClick: () => void }) {
  const router = useRouter();
  const { user, accessToken, logout, refreshProfile } = useAuth();
  const currentSchool = useCurrentSchool(user);
  const canManageBranding = !!user?.permissions.includes("settings.manage") && !!currentSchool;
  // Same permission the "Schools" org nav item already gates on — a plain
  // School Admin (no cross-school reach) never gets a switcher at all,
  // since they have nothing to switch to; Super Admin, Organization Admin,
  // and the Central Finance/HR roles do.
  const canSwitchSchools = !!user?.permissions.includes("schools.view");

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
    const school = currentSchool ? schoolNavItems(user, currentSchool.id) : [];
    return [...school, ...orgNavItems(user)];
  }, [user, currentSchool]);

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

      <div className="flex shrink-0 items-center gap-2.5">
        {accessToken && currentSchool ? (
          <SchoolBrandingEditor
            accessToken={accessToken}
            schoolId={currentSchool.id}
            logoUrl={currentSchool.logoUrl}
            editable={canManageBranding}
            onChanged={refreshProfile}
          />
        ) : (
          <div className="flex size-9 items-center justify-center rounded-full bg-accent text-white">
            <GraduationCap className="size-4.5" />
          </div>
        )}
        {canSwitchSchools && accessToken ? (
          <SchoolContextSwitcher
            accessToken={accessToken}
            currentSchoolId={currentSchool?.id ?? null}
            fallbackName={currentSchool?.name ?? "Ilays Schools"}
            roleLabel={contextRoleLabel(user.roles)}
          />
        ) : (
          <span className="max-w-[110px] truncate font-semibold text-foreground sm:max-w-[220px]">
            {currentSchool?.name ?? "Ilays Schools"}
          </span>
        )}
      </div>

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

// The header's "which school am I looking at" control. Fetches the real,
// actor-scoped school list once on mount (the same endpoint the Schools
// page uses — already correctly scoped server-side via accessibleWhere, so
// a School Admin with schools.view still only ever sees their own
// authorized schools here, never another organization's or another
// admin's). Fetching on mount, not lazily on open, matters here: a Super
// Admin never has a UserSchool row (that's what makes them org-wide), so
// Sidebar's useCurrentSchool can't resolve their current school's real name
// on its own — this list is what fills that in, the moment it loads.
// Reuses the URL-is-the-context model everywhere else in this app already
// relies on (see Sidebar's useCurrentSchool) — picking a school just
// navigates there, no separate stored "selected school" state.
function SchoolContextSwitcher({
  accessToken,
  currentSchoolId,
  fallbackName,
  roleLabel,
}: {
  accessToken: string;
  currentSchoolId: string | null;
  fallbackName: string;
  roleLabel: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [schools, setSchools] = useState<School[] | null>(null);
  const [error, setError] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api
      .listSchools(accessToken)
      .then(setSchools)
      .catch(() => setError(true));
  }, [accessToken]);

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

  const current = schools?.find((s) => s.id === currentSchoolId);
  const displayName = current?.name ?? fallbackName;

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
          <span className="max-w-[140px] truncate font-semibold text-foreground sm:max-w-[220px]">{displayName}</span>
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
          {error ? (
            <p className="px-3 py-2 text-sm text-danger">Couldn&apos;t load your schools.</p>
          ) : !schools ? (
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

// A circular logo with an edit affordance overlaid — only rendered as
// editable for a user with settings.manage (currently School Admin, Super
// Admin, Organization Admin; see seed.ts). Change and remove both re-fetch
// the profile via onChanged so every open tab's header reflects the new
// logo without a full reload.
function SchoolBrandingEditor({
  accessToken,
  schoolId,
  logoUrl,
  editable,
  onChanged,
}: {
  accessToken: string;
  schoolId: string;
  logoUrl: string | null;
  editable: boolean;
  onChanged: () => Promise<void>;
}) {
  const { show } = useToast();
  const [menuOpen, setMenuOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setMenuOpen(false);
    setBusy(true);
    try {
      await api.uploadSchoolLogo(accessToken, schoolId, file);
      await onChanged();
      show("School logo updated.");
    } catch (err) {
      show(err instanceof Error ? err.message : "Couldn't upload the logo.", "danger");
    } finally {
      setBusy(false);
    }
  }

  async function handleRemove() {
    setMenuOpen(false);
    setBusy(true);
    try {
      await api.removeSchoolLogo(accessToken, schoolId);
      await onChanged();
      show("School logo removed.");
    } catch (err) {
      show(err instanceof Error ? err.message : "Couldn't remove the logo.", "danger");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="relative">
      <div className="flex size-9 items-center justify-center overflow-hidden rounded-full bg-accent text-white">
        {busy ? (
          <Loader2 className="size-4 animate-spin" />
        ) : logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- Cloudinary URL, not a local/static asset
          <img src={logoUrl} alt="" className="size-full object-cover" />
        ) : (
          <GraduationCap className="size-4.5" />
        )}
      </div>

      {editable && !busy && (
        <>
          <button
            onClick={() => setMenuOpen((v) => !v)}
            aria-label="Edit school logo"
            className="absolute -right-1 -bottom-1 flex size-4.5 items-center justify-center rounded-full border-2 border-accent-soft bg-accent text-white hover:bg-accent-hover"
          >
            <Camera className="size-2.5" />
          </button>

          {menuOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
              <div className="absolute left-0 z-50 mt-2 w-44 rounded-xl border border-border bg-background p-1 shadow-lg">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-foreground-soft hover:bg-surface-hover hover:text-foreground"
                >
                  <Camera className="size-4" />
                  {logoUrl ? "Change logo" : "Upload logo"}
                </button>
                {logoUrl && (
                  <button
                    onClick={handleRemove}
                    className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-danger hover:bg-danger-soft"
                  >
                    <Trash2 className="size-4" />
                    Remove logo
                  </button>
                )}
              </div>
            </>
          )}
        </>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={handleFile}
      />
    </div>
  );
}
