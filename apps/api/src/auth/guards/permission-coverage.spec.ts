import * as fs from "fs";
import * as path from "path";

// A production outage on 2026-09-12 was caused by a permission
// (`payroll.view`) that existed in application code — enforced via
// @RequirePermissions — but was never granted to any role in the deployed
// database, because that grant only happens in packages/database/prisma/
// seed.ts's role/permission section, which hadn't run in production.
//
// Deploying now runs that seed section automatically (see the Render Start
// Command), which fixes the "seed.ts says X but production never ran
// seed.ts" half of the problem. This test guards the other half: it fails
// at CI time if a future @RequirePermissions key is ever added to a
// controller without also being declared in seed.ts's PERMISSIONS catalog
// and granted to at least one role there — so the mistake is caught before
// merge, not after a real user hits it in production.
//
// This reads seed.ts and every controller as plain source text rather than
// importing/executing either. That's deliberate: it needs no database, no
// Nest application bootstrap, and — most importantly — makes no change
// whatsoever to seed.ts or any controller to become testable.

const API_SRC_DIR = path.join(__dirname, "..", "..");
const SEED_PATH = path.join(__dirname, "../../../../../packages/database/prisma/seed.ts");

function findControllerFiles(dir: string): string[] {
  const results: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...findControllerFiles(full));
    } else if (entry.isFile() && entry.name.endsWith(".controller.ts")) {
      results.push(full);
    }
  }
  return results;
}

// Every observed usage in this codebase is a plain string literal, e.g.
// @RequirePermissions("students.view") or
// @RequirePermissions("transfers.create", "transfers.approve") — this
// extracts every such literal from every @RequirePermissions(...) call in
// a file, regardless of whether it decorates a class or a method.
function extractRequiredPermissionKeys(source: string): string[] {
  const keys: string[] = [];
  const callPattern = /@RequirePermissions\(([^)]*)\)/g;
  let call: RegExpExecArray | null;
  while ((call = callPattern.exec(source))) {
    const stringPattern = /["']([\w.]+)["']/g;
    let str: RegExpExecArray | null;
    while ((str = stringPattern.exec(call[1]))) {
      keys.push(str[1]);
    }
  }
  return keys;
}

function extractDeclaredPermissions(seedSource: string): string[] {
  const arrayMatch = seedSource.match(/const PERMISSIONS = \[([\s\S]*?)\] as const;/);
  if (!arrayMatch) {
    throw new Error("Could not locate `const PERMISSIONS = [...] as const;` in seed.ts — has it been renamed?");
  }
  const keys: string[] = [];
  const stringPattern = /["']([\w.]+)["']/g;
  let str: RegExpExecArray | null;
  while ((str = stringPattern.exec(arrayMatch[1]))) {
    keys.push(str[1]);
  }
  return keys;
}

// SUPER_ADMIN/ORGANIZATION_ADMIN get every permission automatically via a
// dynamic `prisma.permission.findMany()` grant in seed.ts, not a literal
// key — so a permission scoped ONLY to those two org-wide roles (never any
// narrower, school-level role) is fully provisioned but appears just once
// in the source text. Both are genuinely org-admin-only by design: schools
// are organization-level resources, so no school-scoped role should ever
// create or manage one.
const ORG_ADMIN_ONLY_PERMISSIONS = new Set(["schools.create", "schools.manage"]);

// A key granted to some named role appears at least twice in seed.ts: once
// in the PERMISSIONS catalog declaration, and again in whichever role's key
// array grants it (e.g. accountantPermissionKeys). A key that only ever
// appears once — and isn't one of the org-admin-only exceptions above — is
// declared but never actually granted to anyone who could use it.
function occurrenceCount(source: string, key: string): number {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`["']${escaped}["']`, "g");
  return (source.match(pattern) ?? []).length;
}

describe("Permission coverage — @RequirePermissions keys vs. seed.ts", () => {
  const seedSource = fs.readFileSync(SEED_PATH, "utf-8");
  const declaredPermissions = new Set(extractDeclaredPermissions(seedSource));

  const controllerFiles = findControllerFiles(API_SRC_DIR);
  const requiredKeys = new Set<string>();
  for (const file of controllerFiles) {
    for (const key of extractRequiredPermissionKeys(fs.readFileSync(file, "utf-8"))) {
      requiredKeys.add(key);
    }
  }
  const sortedKeys = [...requiredKeys].sort();

  it("scanned at least one controller and found @RequirePermissions usages (sanity check for the scan itself)", () => {
    expect(controllerFiles.length).toBeGreaterThan(10);
    expect(requiredKeys.size).toBeGreaterThan(20);
  });

  it.each(sortedKeys)("%s is declared in seed.ts's PERMISSIONS catalog", (key) => {
    expect(declaredPermissions.has(key)).toBe(true);
  });

  it.each(sortedKeys.filter((k) => !ORG_ADMIN_ONLY_PERMISSIONS.has(k)))(
    "%s is granted to at least one role in seed.ts",
    (key) => {
      expect(occurrenceCount(seedSource, key)).toBeGreaterThanOrEqual(2);
    },
  );
});
