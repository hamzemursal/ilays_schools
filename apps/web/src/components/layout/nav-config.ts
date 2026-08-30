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
  ClipboardCheck,
  BarChart3,
  Contact,
  Megaphone,
  Bell,
  UserCircle,
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
  if (has("guardians.view")) {
    items.push({ label: "Parents", href: `/schools/${schoolId}/parents`, icon: Contact });
  }
  if (has("announcements.view")) {
    items.push({ label: "Announcements", href: `/schools/${schoolId}/announcements`, icon: Megaphone });
  }
  if (user.roles.includes("TEACHER")) {
    items.push({ label: "My classes", href: `/my-classes`, icon: BookUser });
  }
  // A teacher already reaches attendance through "My classes" (scoped to
  // their own assignments) — this admin entry point browses every section
  // in the school, so it's only shown to non-teachers.
  if ((has("attendance.mark") || has("attendance.view")) && !user.roles.includes("TEACHER")) {
    items.push({ label: "Attendance", href: `/schools/${schoolId}/attendance`, icon: ClipboardCheck });
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
  if (has("reports.view")) {
    items.push({ label: "Reports", href: `/schools/${schoolId}/reports`, icon: BarChart3 });
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

// A parent's children can span multiple schools, so — unlike schoolNavItems
// — this section never resolves against a "current school" and always shows
// once the account holds the PARENT role, matching how the Parent Portal's
// own routes (/parent/...) aren't school-scoped in the URL either.
export function parentNavItems(user: Profile): NavItem[] {
  if (!user.roles.includes("PARENT")) return [];
  return [
    { label: "Dashboard", href: "/parent", icon: LayoutDashboard },
    { label: "My Children", href: "/parent/children", icon: Users },
    { label: "Academics", href: "/parent/academics", icon: GraduationCap },
    { label: "Attendance", href: "/parent/attendance", icon: ClipboardCheck },
    { label: "Fees", href: "/parent/fees", icon: Wallet },
    { label: "Announcements", href: "/parent/announcements", icon: Megaphone },
    { label: "Notifications", href: "/parent/notifications", icon: Bell },
    { label: "Profile", href: "/parent/profile", icon: UserCircle },
  ];
}
