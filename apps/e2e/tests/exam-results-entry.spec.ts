import { test, expect } from "@playwright/test";
import { loginAt, signOut } from "../fixtures/auth";
import { ADMIN, TEACHER } from "../fixtures/credentials";

// Full lifecycle: Admin creates an exam, Teacher enters marks and submits for
// review, Admin approves then publishes. Uses the seeded fixture Teacher
// (Amran Hassan), assigned to teach Mathematics in Class 1 · Section A —
// see packages/database/prisma/seed.ts. No Exam/ExamSubject is seeded, so
// this test creates its own via the UI, matching the platform's established
// no-direct-DB-seeding-in-tests convention.
test("Admin creates an exam, Teacher submits results, Admin approves and publishes", async ({ page }) => {
  const examName = `Term 1 Exam ${Date.now()}`;

  // --- Admin: create the exam via the 4-step wizard ---
  await loginAt(page, "/admin/login", ADMIN.email, ADMIN.password);
  await expect(page).toHaveURL(/\/dashboard/);

  await page.getByRole("navigation").getByRole("link", { name: "Academic" }).click();
  // "Exams" here is a tab button on the Academic page, not a sidebar link.
  await page.getByRole("button", { name: "Exams" }).click();
  // Rendered as a Button nested inside a Link — ambiguous accessible role,
  // same pattern as "Add student"/"View School" elsewhere — match by text.
  await page.getByText("Create Exam", { exact: true }).click();

  // Step 1 — Basic Information. Academic Year already defaults to a usable
  // value (the current year) — left untouched. There is no Exam Type field:
  // Term is the only academic period. Term is deliberately NEVER pre-selected (a default is how a Term 2 exam ends up
  // saved under Term 1), so it must be chosen: the seeded year always has
  // Term 1 and Term 2, after the "Select…" placeholder.
  await page.getByPlaceholder("e.g. Term 1 Exam 2027").fill(examName);
  await expect(page.getByText("Exam Type")).toHaveCount(0);
  await page.locator("#examTermId").selectOption({ label: "Term 1 (50%)" });
  await page.getByRole("button", { name: "Next" }).click();

  // Step 2 — Classes & Subjects: checkboxes, not a dropdown. With exactly
  // one seeded class and one seeded subject, "Select All" on each panel is
  // simpler and more robust than targeting a single unlabeled checkbox.
  // Two identically-labeled "Select All" buttons exist (one per panel) —
  // the Classes panel always renders first, so .first()/.last() is safe;
  // waiting for the real subject name to appear confirms the async
  // class→subjects fetch has actually resolved before selecting it.
  const selectAllButtons = page.getByRole("button", { name: "Select All" });
  await selectAllButtons.first().click();
  await expect(page.getByText("Mathematics", { exact: true })).toBeVisible();
  await selectAllButtons.last().click();
  await page.getByRole("button", { name: "Next" }).click();

  // Step 3 — Exam Settings: Maximum Mark already defaults to 100.
  await page.getByRole("button", { name: "Next" }).click();

  // Step 4 — Review & Create.
  await page.getByRole("button", { name: "Create Exam" }).click();
  await expect(page.getByText("Exam created", { exact: true })).toBeVisible();

  await signOut(page);

  // --- Teacher: enter marks and submit for review ---
  await loginAt(page, "/teacher/login", TEACHER.email, TEACHER.password);
  await expect(page).toHaveURL(/\/dashboard/);

  await page.goto("/my-exams");
  await page.getByRole("button", { name: "Enter Results" }).click();
  await expect(page).toHaveURL(/\/schools\/.+\/exam-subjects\/.+\/sections\/.+\/results/);

  // The single mark input has no id/aria-label — safe here since the
  // section has exactly one enrolled student (Hodan Ali).
  await page.locator('input[type="number"]').fill("85");

  // Clicking "Submit for Review" opens a confirmation dialog that reuses
  // the same button label, so the page's own button and the dialog's
  // confirm button both match "Submit for Review" — scope to the dialog.
  await page.getByRole("button", { name: "Submit for Review" }).click();
  const submitDialog = page.getByRole("alertdialog");
  await submitDialog.getByRole("checkbox").check();
  await submitDialog.getByRole("button", { name: "Submit for Review" }).click();
  await expect(page.getByText("Submitted — waiting for Admin review.")).toBeVisible();

  await signOut(page);

  // --- Admin: approve, then publish ---
  await loginAt(page, "/admin/login", ADMIN.email, ADMIN.password);
  await expect(page).toHaveURL(/\/dashboard/);

  await page.getByRole("navigation").getByRole("link", { name: "Results Review" }).click();
  await page.getByRole("link", { name: examName }).click();

  await page.getByRole("button", { name: "Approve Results" }).click();
  const approveDialog = page.getByRole("alertdialog");
  await approveDialog.getByRole("checkbox").check();
  await approveDialog.getByRole("button", { name: "Approve Results" }).click();
  await expect(page.getByText("Approved", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Publish Results" }).click();
  const publishDialog = page.getByRole("alertdialog");
  await publishDialog.getByRole("checkbox").check();
  await publishDialog.getByRole("button", { name: "Publish Results" }).click();
  await expect(page.getByText("Published — visible to students and parents.")).toBeVisible();
});
