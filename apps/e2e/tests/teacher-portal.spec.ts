import { test, expect } from "@playwright/test";
import { loginAt, signOut } from "../fixtures/auth";
import { TEACHER } from "../fixtures/credentials";

// Amran Hassan (TEACHER) holds the one seeded TeacherAssignment — Mathematics,
// Class 1 · Section A, academic year 2027 — see
// packages/database/prisma/seed.ts. Runs (alphabetically, workers: 1) after
// attendance-marking.spec.ts and exam-results-entry.spec.ts, so the roster's
// attendance summary and "My Exams" list already reflect real data those
// tests created for this exact assignment.
test("Teacher views their real classes/exams, edits their own profile, and is denied an admin-only page", async ({ page }) => {
  await loginAt(page, "/teacher/login", TEACHER.email, TEACHER.password);
  await expect(page).toHaveURL(/\/dashboard/);

  // --- Dashboard: RBAC via real permission-driven UI, not a hardcoded
  // role check — a plain Teacher has no academic.view/students.view/etc.,
  // so the admin stat cards and quick links never render, but the
  // Teacher-specific "My classes" link does. ---
  await expect(page.getByText("TEACHER", { exact: true })).toBeVisible();
  // Appears both in the page title ("Welcome back, Saamalay Primary
  // School") and the "Authorized schools" field below — .first() avoids a
  // strict-mode violation on the duplicate substring match.
  await expect(page.getByText("Saamalay Primary School").first()).toBeVisible();
  // "My classes" renders twice — the persistent sidebar link and this same
  // dashboard's own Quick Links card — same collision already documented in
  // attendance-marking.spec.ts; scope to the sidebar for this check.
  await expect(page.getByRole("navigation").getByRole("link", { name: "My classes" })).toBeVisible();
  // The Quick Links cards (in <main>, not the sidebar) are the ones
  // actually gated by user.permissions in DashboardPage itself — scoping
  // here is what makes this a real RBAC check, not an accident of routing.
  const quickLinks = page.getByRole("main");
  await expect(quickLinks.getByRole("link", { name: "Students" })).not.toBeVisible();
  await expect(quickLinks.getByRole("link", { name: "Finance" })).not.toBeVisible();

  // --- My classes: real profile + real assignment. ---
  await page.getByRole("navigation").getByRole("link", { name: "My classes" }).click();
  await expect(page).toHaveURL(/\/my-classes$/);
  // The teacher's own name is itself rendered as a second <h1> on this page
  // (alongside the PageHeader's own "My classes" <h1>) — same
  // announcer-duplication risk as the dashboard's title above, so .first().
  await expect(page.getByText("Amran Hassan").first()).toBeVisible();
  await expect(page.getByText("#EMP-0001")).toBeVisible();
  await expect(page.getByText("Class 1 · A", { exact: true })).toBeVisible();
  await expect(page.getByText("Mathematics", { exact: true })).toBeVisible();

  // --- Real self-service mutation: edit contact details. Amran has no
  // phone on file in the seed, so this both exercises the real PATCH and
  // proves the field goes from absent to present. Neither the Phone nor
  // Address inputs have an id/htmlFor/placeholder (see EditMyProfileForm),
  // so the form is scoped by its own unique "Save changes" button and the
  // Phone field is targeted by DOM order (first textbox in that form). ---
  await page.getByRole("button", { name: "Edit my profile" }).click();
  const editForm = page.locator("form").filter({ hasText: "Emergency contact phone" });
  await editForm.getByRole("textbox").first().fill("0699999999");
  await editForm.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Profile updated.")).toBeVisible();
  await expect(page.getByText("0699999999")).toBeVisible();

  // --- Click into the assignment: real roster (Hodan Ali), a real
  // attendance summary reflecting the ABSENT mark from
  // attendance-marking.spec.ts, and the real linked guardian. ---
  const markAttendanceHref = await page.getByRole("link", { name: "Mark attendance" }).first().getAttribute("href");
  const schoolId = markAttendanceHref!.match(/\/schools\/([^/]+)\//)![1];

  await page.getByText("Class 1 · A", { exact: true }).click();
  await expect(page).toHaveURL(/\/my-classes\/.+/);
  await expect(page.getByText("Hodan Ali")).toBeVisible();
  await expect(page.getByText("0 present", { exact: true })).toBeVisible();
  await expect(page.getByText("1 absent", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Guardian info" }).click();
  await expect(page.getByText("Amina Ali")).toBeVisible();
  await expect(page.getByText("Mother", { exact: true })).toBeVisible();
  await expect(page.getByText("Primary contact")).toBeVisible();

  // --- My Exams: real published result from exam-results-entry.spec.ts. ---
  await page.goto("/my-exams");
  await expect(page.getByText("Mathematics", { exact: true })).toBeVisible();
  await expect(page.getByText("Published", { exact: true })).toBeVisible();

  // --- RBAC: a Teacher has no teachers.view permission — navigating
  // straight to the School Admin's Teachers list must surface the real
  // backend 403, not leak the list or silently show nothing. ---
  await page.goto(`/schools/${schoolId}/teachers`);
  await expect(page.getByText("Missing required permission: teachers.view")).toBeVisible();

  await signOut(page);
});
