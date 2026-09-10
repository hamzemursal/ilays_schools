import { test, expect } from "@playwright/test";
import { loginAt } from "../fixtures/auth";
import { ADMIN } from "../fixtures/credentials";

// The seeded fixture school already has one student, Hodan Ali (DOB
// 2018-05-01) — see packages/database/prisma/seed.ts. Entering the exact
// same name + DOB with no legacy ID should still be caught (see the
// "History" comment on StudentsService.create's duplicate check — this is
// deliberately not the lastName-only match that was reverted for false
// positives).
test("adding a student with the same name + DOB as an existing one is flagged before creating", async ({ page }) => {
  await loginAt(page, "/admin/login", ADMIN.email, ADMIN.password);
  await expect(page).toHaveURL(/\/dashboard/);

  // No bare /students route — School Admin's Students page is nested under
  // its school id (see nav-config.ts), so it has to be reached by clicking
  // the actual sidebar link rather than guessing the URL.
  await page.getByRole("link", { name: "Students" }).click();
  // Rendered as a Button nested inside a Link — ambiguous accessible role,
  // so match on visible text rather than assuming "link" or "button".
  await page.getByText("Add student", { exact: true }).click();

  await page.getByLabel("First name", { exact: true }).fill("Hodan");
  await page.getByLabel("Last name", { exact: true }).fill("Ali");
  await page.locator('input[type="date"]').fill("2018-05-01");
  await page.getByLabel("Sex", { exact: true }).selectOption("FEMALE");
  await page.getByRole("button", { name: "Next" }).click(); // Parent/Guardian
  await page.getByRole("button", { name: "Next" }).click(); // Enrollment

  await page.getByLabel("Academic year", { exact: true }).selectOption({ label: "2027 (current)" });
  await page.getByLabel("Class", { exact: true }).selectOption({ label: "Class 1" });
  await page.getByRole("button", { name: "Next" }).click(); // Subjects
  await page.getByRole("button", { name: "Next" }).click(); // Review
  await page.getByRole("button", { name: "Create student" }).click();

  await expect(page.getByText(/possible duplicate/i)).toBeVisible();
  await expect(page.getByText("Hodan Ali", { exact: true })).toBeVisible();
  // Never silently created — the override is a separate, explicit action.
  await expect(page.getByRole("button", { name: /different person.*create anyway/i })).toBeVisible();
});
