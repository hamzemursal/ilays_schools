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

  await page.goto("/students");
  // Rendered as a Button nested inside a Link — ambiguous accessible role,
  // so match on visible text rather than assuming "link" or "button".
  await page.getByText("Add student", { exact: true }).click();

  // Not exact: required fields' aria-hidden asterisk still folds into the
  // computed accessible name on some browser/Playwright combinations.
  await page.getByLabel("First name").fill("Hodan");
  await page.getByLabel("Last name").fill("Ali");
  await page.locator('input[type="date"]').fill("2018-05-01");
  await page.getByLabel("Sex").selectOption("FEMALE");
  await page.getByRole("button", { name: "Next" }).click(); // Parent/Guardian
  await page.getByRole("button", { name: "Next" }).click(); // Enrollment

  await page.getByLabel("Academic year").selectOption({ label: "2027 (current)" });
  await page.getByLabel("Class").selectOption({ label: "Class 1" });
  await page.getByRole("button", { name: "Next" }).click(); // Subjects
  await page.getByRole("button", { name: "Next" }).click(); // Review
  await page.getByRole("button", { name: "Create student" }).click();

  await expect(page.getByText(/possible duplicate/i)).toBeVisible();
  await expect(page.getByText("Hodan Ali")).toBeVisible();
  // Never silently created — the override is a separate, explicit action.
  await expect(page.getByRole("button", { name: /different person.*create anyway/i })).toBeVisible();
});
