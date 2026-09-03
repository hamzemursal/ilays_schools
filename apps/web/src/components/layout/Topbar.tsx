"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Bell, Camera, GraduationCap, KeyRound, Loader2, LogOut, Menu, Search, Trash2, UserCircle, X } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { Avatar } from "@/components/ui/Avatar";
import { useToast } from "@/components/ui/Toast";
import { api } from "@/lib/api";
import { useCurrentSchool } from "./Sidebar";
import { orgNavItems, schoolNavItems, type NavItem } from "./nav-config";

export function Topbar({ onMenuClick }: { onMenuClick: () => void }) {
  const router = useRouter();
  const { user, accessToken, logout, refreshProfile } = useAuth();
  const currentSchool = useCurrentSchool(user);
  const canManageBranding = !!user?.permissions.includes("settings.manage") && !!currentSchool;

  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [notifOpen, setNotifOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

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
        <span className="max-w-[110px] truncate font-semibold text-foreground sm:max-w-[220px]">
          {currentSchool?.name ?? "Ilays Schools"}
        </span>
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
          </button>
          {notifOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setNotifOpen(false)} />
              <div className="absolute right-0 z-50 mt-2 w-72 rounded-xl border border-border bg-background p-4 shadow-lg">
                <p className="text-sm font-semibold text-foreground">Notifications</p>
                <p className="mt-2 text-sm text-foreground-soft">You&apos;re all caught up — nothing new yet.</p>
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
