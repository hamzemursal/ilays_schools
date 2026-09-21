import type { Profile } from "@/lib/api";
import { orgNavItems, schoolNavItems, type NavItem } from "./nav-config";

// The Super Admin's own sidebar grouping: OVERVIEW / ORGANIZATION / ACADEMIC /
// OPERATIONS / GOVERNANCE. It is built ONLY from the items nav-config already
// produces for this user (orgNavItems / schoolNavItems), matched by their real
// href - nothing here declares a route, so a page that does not exist can
// never appear, and a permission-gated item still disappears exactly as it
// did before. Items nav-config yields that this grouping doesn't name (none
// today) fall into a trailing "More" group rather than vanishing, so a future
// org-level route is never silently hidden from the Super Admin.

export interface SuperAdminNavGroup {
  label: string;
  items: NavItem[];
}

// href -> the label the Super Admin sidebar shows for it. The label may differ
// from nav-config's (e.g. "Exams & Results" for /results-review); the href is
// the source of truth.
const GROUPS: { label: string; entries: { href: string; label?: string }[] }[] = [
  { label: "Overview", entries: [{ href: "/dashboard" }] },
  { label: "Organization", entries: [{ href: "/schools" }] },
  {
    label: "Academic",
    entries: [{ href: "/exam-papers" }, { href: "/results-review", label: "Exams & Results" }],
  },
  {
    label: "Operations",
    entries: [{ href: "/student-lifecycle" }, { href: "/transfers" }, { href: "/finance", label: "Central Finance" }],
  },
  { label: "Governance", entries: [{ href: "/audit-log" }] },
];

export function isSuperAdmin(user: Pick<Profile, "roles"> | null | undefined): boolean {
  return !!user?.roles.includes("SUPER_ADMIN");
}

export function superAdminNavGroups(user: Profile): SuperAdminNavGroup[] {
  const available = orgNavItems(user);
  const byHref = new Map(available.map((item) => [item.href, item]));
  const used = new Set<string>();

  const groups: SuperAdminNavGroup[] = [];
  for (const group of GROUPS) {
    const items: NavItem[] = [];
    for (const entry of group.entries) {
      const item = byHref.get(entry.href);
      if (!item) continue;
      used.add(entry.href);
      items.push(entry.label ? { ...item, label: entry.label } : item);
    }
    if (items.length > 0) groups.push({ label: group.label, items });
  }

  const rest = available.filter((item) => !used.has(item.href));
  if (rest.length > 0) groups.push({ label: "More", items: rest });
  return groups;
}

// The selected school's own workspace links - exactly the items the app has
// always shown once a school is in context. Empty while the Super Admin is on
// an organization-level page ("All Schools").
export function superAdminSchoolItems(user: Profile, schoolId: string | null): NavItem[] {
  return schoolId ? schoolNavItems(user, schoolId) : [];
}

// A nav link is "active" for its own page and anything nested under it, except
// the Schools list: /schools/:id/... is a school's workspace (shown in the
// selected-school section), not the organization-level Schools page.
export function isNavActive(pathname: string, href: string): boolean {
  if (href === "/schools") return pathname === "/schools";
  return pathname === href || pathname.startsWith(`${href}/`);
}
