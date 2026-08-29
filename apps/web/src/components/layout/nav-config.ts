import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  GraduationCap,
  Users,
  UserSquare2,
  Wallet,
  ArrowUpCircle,
  ArrowLeftRight,
  ScrollText,
  Building2,
  BookUser,
} from "lucide-react";
import type { Profile } from "@/lib/api";

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
}

// Every school-scoped item resolves against whichever school is currently in
// context (from the URL, falling back to the user's own single school) — see
// Sidebar's useCurrentSchool. Items simply declare the permission that gates
// them; a School Admin, Super Admin, and Teacher naturally see different
// subsets without any role-name branching here.
export function schoolNavItems(user: Profile, schoolId: string): NavItem[] {
  const items: NavItem[] = [];
  const has = (p: string) => user.permissions.includes(p);

  if (has("academic.view")) {
    items.push({ label: "Dashboard", href: `/schools/${schoolId}/dashboard`, icon: LayoutDashboard });
    items.push({ label: "Academic", href: `/schools/${schoolId}/academic`, icon: GraduationCap });
  }
  if (has("students.view")) {
    items.push({ label: "Students", href: `/schools/${schoolId}/students`, icon: Users });
  }
  if (has("teachers.view")) {
    items.push({ label: "Teachers", href: `/schools/${schoolId}/teachers`, icon: UserSquare2 });
  }
  if (user.roles.includes("TEACHER")) {
    items.push({ label: "My classes", href: `/my-classes`, icon: BookUser });
  }
  if (has("fees.manage") || has("payments.record")) {
    items.push({ label: "Finance", href: `/schools/${schoolId}/finance`, icon: Wallet });
  }
  if (has("promotions.execute")) {
    items.push({ label: "Promotions", href: `/schools/${schoolId}/promotions`, icon: ArrowUpCircle });
  }
  if (has("transfers.create") || has("transfers.approve")) {
    items.push({ label: "Transfers", href: `/schools/${schoolId}/transfers`, icon: ArrowLeftRight });
  }
  if (has("audit.view")) {
    items.push({ label: "Audit log", href: `/schools/${schoolId}/audit-log`, icon: ScrollText });
  }
  return items;
}

export function orgNavItems(user: Profile): NavItem[] {
  const items: NavItem[] = [];
  if (user.permissions.includes("schools.view")) {
    items.push({ label: "Schools", href: "/schools", icon: Building2 });
  }
  return items;
}
