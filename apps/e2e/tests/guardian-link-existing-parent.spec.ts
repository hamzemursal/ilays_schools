import { test, expect } from "@playwright/test";
import { loginAt } from "../fixtures/auth";
import { ADMIN } from "../fixtures/credentials";

// The seeded fixture school already has a guardian, Amina Ali (phone
// 0611111111), linked as the mother of Hodan Ali — see
// packages/database/prisma/seed.ts. This creates a SECOND student and links
// that same real Amina Ali record to her via the Student Profile's new
// "search existing parent" workflow, proving the search finds the existing
// record (with an accurate linked-student count) and reuses it instead of
// creating a second "Amina Ali" — the exact duplicate this workflow exists
// to prevent.
//
// The fixture school's only seeded class/section is Class 1 · A — the same
// roster teacher-portal.spec.ts depends on having exactly one guardian-linked
// student — so the new student created here is permanently deleted at the
// end (the same "Delete" action already covered by its own coverage
// elsewhere) to leave that roster exactly as every other spec found it.
test("linking an existing parent to a new student reuses the real record instead of creating a duplicate", async ({ page }) => {
  await loginAt(page, "/admin/login", ADMIN.email, ADMIN.password);
  await expect(page).toHaveURL(/\/dashboard/);

  await page.getByRole("navigation").getByRole("link", { name: "Students" }).click();
  await page.getByText("Add student", { exact: true }).click();

  await page.locator("#firstName").fill("Sakariye");
  await page.locator("#lastName").fill("Hassan");
  await page.locator('input[type="date"]').fill("2016-03-10");
  await page.locator("#sex").selectOption("MALE");
  await page.getByRole("button", { name: "Next" }).click(); // Parent/Guardian — skipped, added from the profile instead
  await page.getByRole("button", { name: "Next" }).click(); // Enrollment

  await page.locator("#academicYearId").selectOption({ label: "2027 (current)" });
  await page.locator("#classId").selectOption({ label: "Class 1" });
  await page.getByRole("button", { name: "Next" }).click(); // Subjects
  await page.getByRole("button", { name: "Next" }).click(); // Review
  await page.getByRole("button", { name: "Create student" }).click();

  await expect(page.getByText("Student created")).toBeVisible();
  await page.getByRole("button", { name: "View student profile" }).click();
  await expect(page.getByRole("heading", { name: "Sakariye Hassan" })).toBeVisible();
  const studentProfileUrl = page.url();

  await page.getByRole("button", { name: "Add guardian" }).click();
  await page.getByPlaceholder("Search parent by name, phone, or email…").fill("Amina");

  const result = page.getByText("Amina Ali", { exact: true });
  await expect(result).toBeVisible();
  await expect(page.getByText(/Already linked to \d+ student/)).toBeVisible();

  await page.getByRole("button", { name: "Select Parent" }).click();
  await expect(page.getByText("Link Amina to this student")).toBeVisible();
  await page.getByRole("combobox", { name: "Relationship" }).selectOption("MOTHER");
  await page.getByRole("button", { name: "Save / Link Parent" }).click();

  // Now linked to this student's profile — real record, not a duplicate.
  await expect(page.getByText("Guardian added.")).toBeVisible();
  await expect(page.getByText("Amina Ali", { exact: true })).toBeVisible();
  await expect(page.getByText("Mother", { exact: true })).toBeVisible();

  // Opening her existing Parent Profile from here must show BOTH children —
  // proof this reused the one real Guardian row rather than creating
  // "Amina Ali #2" for the new student.
  await page.getByRole("link", { name: /View profile/ }).click();
  await expect(page).toHaveURL(/\/parents\//);
  await expect(page.getByRole("heading", { name: "Amina Ali" })).toBeVisible();
  await expect(page.getByText("Hodan Ali")).toBeVisible();
  await expect(page.getByText("Sakariye Hassan")).toBeVisible();

  // Cleanup: this test's only side effect on shared fixture data is this one
  // new student (and the StudentGuardian row cascade-deleted with it) — the
  // real Amina Ali record and her original link to Hodan Ali are untouched.
  await page.goto(studentProfileUrl);
  await page.getByRole("button", { name: "Delete" }).click();
  await page.getByRole("button", { name: "Delete permanently" }).click();
  await expect(page.getByText("Student deleted permanently.")).toBeVisible();
});
