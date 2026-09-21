import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import type { Profile } from "@/lib/api";
import { orgNavItems } from "./nav-config";
import { isNavActive, isSuperAdmin, superAdminNavGroups, superAdminSchoolItems } from "./super-admin-nav";

function user(overrides: Partial<Profile> = {}): Profile {
  return {
    id: "u1",
    email: "super@ilays.test",
    roles: ["SUPER_ADMIN"],
    permissions: [
      "schools.view",
      "audit.view",
      "students.view",
      "transfers.create",
      "results.view",
      "results.approve",
      "finance.central.view",
      "academic.view",
      "teachers.view",
      "staff.view",
      "reports.view",
    ],
    schools: [],
    mustChangePassword: false,
    mustSetup2FA: false,
    ...overrides,
  } as Profile;
}

describe("Super Admin sidebar structure", () => {
  it("groups the real organization routes: Overview / Organization / Academic / Operations / Governance", () => {
    const groups = superAdminNavGroups(user());

    expect(groups.map((g) => g.label)).toEqual(["Overview", "Organization", "Academic", "Operations", "Governance"]);
    expect(Object.fromEntries(groups.map((g) => [g.label, g.items.map((i) => i.label)]))).toEqual({
      Overview: ["Dashboard"],
      Organization: ["Schools"],
      Academic: ["Exam Papers", "Exams & Results"],
      Operations: ["Student Lifecycle", "Transfers", "Central Finance"],
      Governance: ["Audit Log"],
    });
  });

  it("only ever links routes nav-config already provides — nothing is declared or invented here", () => {
    const real = new Set(orgNavItems(user()).map((i) => i.href));
    const shown = superAdminNavGroups(user()).flatMap((g) => g.items.map((i) => i.href));

    expect(shown.length).toBeGreaterThan(0);
    for (const href of shown) expect(real.has(href)).toBe(true);
    // Every real route is still reachable - none is silently dropped.
    for (const href of real) expect(shown).toContain(href);
  });

  it("does not offer pages that have no route: Users & Roles, Reports, System Settings, Academic Years, Classes & Sections", () => {
    const labels = superAdminNavGroups(user()).flatMap((g) => g.items.map((i) => i.label));

    for (const missing of ["Users & Roles", "Reports", "System Settings", "Academic Years", "Classes & Sections", "Teachers", "Staff"]) {
      expect(labels).not.toContain(missing);
    }
  });

  it("keeps permission gating: an item the account may not use never appears", () => {
    const groups = superAdminNavGroups(user({ permissions: ["schools.view"] }));

    expect(groups.flatMap((g) => g.items.map((i) => i.label))).toEqual(["Dashboard", "Schools"]);
  });

  it("uses the real href for each label (Exams & Results is Results Review)", () => {
    const items = superAdminNavGroups(user()).flatMap((g) => g.items);

    expect(items.find((i) => i.label === "Exams & Results")?.href).toBe("/results-review");
    expect(items.find((i) => i.label === "Central Finance")?.href).toBe("/finance");
  });

  it("the selected school's workspace items only exist once a school is in context", () => {
    expect(superAdminSchoolItems(user(), null)).toEqual([]);
    const items = superAdminSchoolItems(user(), "school-1");
    expect(items.length).toBeGreaterThan(0);
    expect(items.every((i) => i.href.startsWith("/schools/school-1/") || i.href.startsWith("/my-"))).toBe(true);
  });

  it("recognises SUPER_ADMIN only — Organization Admin, School Admin and Teacher are not the Super Admin", () => {
    expect(isSuperAdmin(user())).toBe(true);
    for (const roles of [["ORGANIZATION_ADMIN"], ["SCHOOL_ADMIN"], ["TEACHER"], ["PARENT"], ["STUDENT"], []]) {
      expect(isSuperAdmin({ roles })).toBe(false);
    }
    expect(isSuperAdmin(null)).toBe(false);
  });
});

describe("isNavActive", () => {
  it("is active on the exact page and on nested pages", () => {
    expect(isNavActive("/audit-log", "/audit-log")).toBe(true);
    expect(isNavActive("/transfers/abc", "/transfers")).toBe(true);
    expect(isNavActive("/finance", "/audit-log")).toBe(false);
  });

  it("Schools is active only on the Schools list — a school's own workspace is not the organization Schools page", () => {
    expect(isNavActive("/schools", "/schools")).toBe(true);
    expect(isNavActive("/schools/s1/students", "/schools")).toBe(false);
    expect(isNavActive("/schools/s1/dashboard", "/schools")).toBe(false);
  });
});

describe("Super Admin theme is scoped, so no other role's design can change", () => {
  const css = fs.readFileSync(path.resolve(__dirname, "../../app/globals.css"), "utf8");

  it("the default palette (:root) still holds the original accent and sidebar colors", () => {
    const root = css.match(/:root\s*\{([^}]*)\}/)![1];
    expect(root).toMatch(/--accent:\s*#2456e5/i);
    expect(root).toMatch(/--sidebar-bg:\s*#ffffff/i);
    expect(root).toMatch(/--border:\s*#dde1e8/i);
  });

  it("the Indigo palette exists only under [data-theme=\"super-admin\"] with the specified values", () => {
    const block = css.match(/\[data-theme="super-admin"\]\s*\{([^}]*)\}/)![1];
    expect(block).toMatch(/--accent:\s*#4f46e5/i);
    expect(block).toMatch(/--accent-hover:\s*#4338ca/i);
    expect(block).toMatch(/--surface:\s*#f8fafc/i);
    expect(block).toMatch(/--border:\s*#e2e8f0/i);
    expect(block).toMatch(/--foreground:\s*#0f172a/i);
    expect(block).toMatch(/--foreground-soft:\s*#64748b/i);
    expect(block).toMatch(/--danger:\s*#dc2626/i);
    // Indigo never appears in the global block.
    expect(css.match(/:root\s*\{([^}]*)\}/)![1]).not.toMatch(/4f46e5/i);
  });

  it("defines the navy and cyan identity colors", () => {
    expect(css).toMatch(/--color-sa-navy:\s*#0b1220/i);
    expect(css).toMatch(/--color-sa-navy-2:\s*#0f172a/i);
    expect(css).toMatch(/--color-sa-cyan:\s*#06b6d4/i);
  });
});
