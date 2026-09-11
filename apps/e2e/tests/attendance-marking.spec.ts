import { test, expect } from "@playwright/test";
import { loginAt } from "../fixtures/auth";
import { TEACHER } from "../fixtures/credentials";

// The seeded fixture Teacher (Amran Hassan) holds a TeacherAssignment for
// Mathematics in Class 1 · Section A, academic year 2027 — see
// packages/database/prisma/seed.ts. Hodan Ali is the section's only
// enrolled student, so the roster here is exactly one row.
test("Teacher marks daily attendance for their section", async ({ page }) => {
  await loginAt(page, "/teacher/login", TEACHER.email, TEACHER.password);
  await expect(page).toHaveURL(/\/dashboard/);

  // "My classes" also appears as its own "Quick links" card on this same
  // dashboard (Teacher role) — scope to the sidebar <nav> to avoid that
  // collision, same pattern as "Students" in student-duplicate-detection.spec.ts.
  await page.getByRole("navigation").getByRole("link", { name: "My classes" }).click();
  await expect(page).toHaveURL(/\/my-classes/);

  await page.getByRole("button", { name: "Mark attendance" }).click();
  await expect(page).toHaveURL(/\/schools\/.+\/sections\/.+\/attendance/);

  // Defaults to "everyone present" — mark the one student Absent so the
  // save actually records a non-default status, not just accepted defaults.
  await page.getByRole("button", { name: "Absent", exact: true }).click();
  await page.getByRole("button", { name: "Save attendance" }).click();

  await expect(page.getByText(/Saved — 1 student\(s\) recorded for/)).toBeVisible();
});
