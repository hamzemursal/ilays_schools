"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Bell, KeyRound, LogOut, Menu, Search, UserCircle, X } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { Avatar } from "@/components/ui/Avatar";
import { useCurrentSchool } from "./Sidebar";
import { orgNavItems, schoolNavItems, type NavItem } from "./nav-config";

export function Topbar({ onMenuClick }: { onMenuClick: () => void }) {
  const router = useRouter();
  const { user, logout } = useAuth();
  const currentSchool = useCurrentSchool(user);

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
    <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center gap-3 border-b border-border bg-background/95 px-4 backdrop-blur sm:px-6">
      <button
        onClick={onMenuClick}
        className="rounded-lg p-2 text-foreground-soft hover:bg-surface-hover lg:hidden"
        aria-label="Open menu"
      >
        <Menu className="size-5" />
      </button>

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
                    router.push("/login");
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
