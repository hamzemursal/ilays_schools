import { test, expect } from "@playwright/test";
import { loginAt, signOut } from "../fixtures/auth";
import { PARENT } from "../fixtures/credentials";

// Amina Ali (PARENT) is the seeded guardian of Hodan Ali, her only linked
// child — see packages/database/prisma/seed.ts. This suite runs with
// workers: 1 and files in alphabetical order, so by the time this file
// runs, attendance-marking.spec.ts, exam-results-entry.spec.ts, and
// fee-payment-recording.spec.ts have already created real attendance,
// exam-result, and invoice/payment data for this exact student — this test
// reads that real data rather than seeding anything of its own.
test("Parent views real academic/attendance/fee data for their child and submits a ZAAD payment notice", async ({ page }) => {
  await loginAt(page, "/parent/login", PARENT.email, PARENT.password);
  await expect(page).toHaveURL(/\/parent$/);

  // --- Dashboard: real child card, school-isolation-adjacent (guardian
  // scoping) — exactly the one child Amina is linked to. The plain-text
  // match also hits Next's own hidden route-announcer element (mirrors
  // page content for accessibility), so this is scoped to the real <h1>.
  await expect(page.getByRole("heading", { name: `Welcome, ${PARENT.email}` })).toBeVisible();
  const dashboardChildCard = page.locator("div.rounded-xl").filter({ hasText: "Hodan Ali" });
  await expect(dashboardChildCard).toBeVisible();
  await expect(dashboardChildCard.getByText("Class 1 · A")).toBeVisible();
  await expect(dashboardChildCard.getByText("ACTIVE", { exact: true })).toBeVisible();

  // --- My Children: with exactly one child, SelectedChildContext
  // auto-selects it (see SelectedChildContext.tsx) — the profile card
  // appears with no click needed. "Hodan Ali" renders twice on this page
  // (the child-list card above, and the profile card below). The academic
  // year ("2027") is also duplicated between the two cards, so this only
  // asserts on the profile card's School field, which is unique to it —
  // the top child-list card never shows a school name at all. ---
  await page.getByRole("navigation").getByRole("link", { name: "My Children" }).click();
  await expect(page).toHaveURL(/\/parent\/children/);
  await expect(page.getByText("Student profile")).toBeVisible();
  await expect(page.getByText("Saamalay Primary School")).toBeVisible();

  // --- Academics: real Subjects + real published exam result. ---
  await page.getByRole("navigation").getByRole("link", { name: "Academics" }).click();
  await expect(page).toHaveURL(/\/parent\/academics/);
  // Subjects tab is the default.
  await expect(page.getByText("Mathematics", { exact: true })).toBeVisible();
  await expect(page.getByText("Teacher: Amran Hassan")).toBeVisible();

  await page.getByRole("button", { name: "Exams & Results" }).click();
  // exam-results-entry.spec.ts submits 85/100 and publishes — a real,
  // already-published result, not an empty state.
  await expect(page.getByText("85 / 100")).toBeVisible();
  await expect(page.getByText("85%", { exact: true })).toBeVisible();

  // --- Attendance: real ABSENT mark from attendance-marking.spec.ts. ---
  await page.getByRole("navigation").getByRole("link", { name: "Attendance" }).click();
  await expect(page).toHaveURL(/\/parent\/attendance/);
  // toBeAttached, not toBeVisible — an <option>'s own visibility inside a
  // closed native <select> isn't a meaningful signal; this just confirms
  // the real current year is genuinely offered as a choice.
  await expect(page.getByRole("option", { name: "2027 (Current)" })).toBeAttached();
  await expect(page.getByText("Daily attendance")).toBeVisible();
  // Exactly one day recorded so far, marked ABSENT — not the empty state.
  await expect(page.getByText("1 day(s) recorded this year.")).toBeVisible();
  await expect(page.getByRole("cell", { name: "ABSENT", exact: true })).toBeVisible();

  // --- Fees: real $120 invoice (paid in full) from
  // fee-payment-recording.spec.ts, plus a real self-service mutation
  // (submitting a ZAAD payment notice) that this test creates itself. ---
  await page.getByRole("navigation").getByRole("link", { name: "Fees" }).click();
  await expect(page).toHaveURL(/\/parent\/fees/);
  await expect(page.getByRole("cell", { name: "120.00" }).first()).toBeVisible();
  await expect(page.getByText("PAID", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Payment History" }).click();
  await expect(page.getByText("CASH", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Submit Payment" }).click();
  await page.getByRole("spinbutton").fill("25");
  await page.getByPlaceholder("Transaction ID").fill("E2E-ZAAD-REF");
  // Non-exact "Submit" also matches the "Submit Payment" tab button itself.
  await page.getByRole("button", { name: "Submit", exact: true }).click();
  await expect(page.getByText("Payment notice submitted. It will be verified by the school.")).toBeVisible();
  // Each submission renders as a plain flex row (not a Card), so scope by
  // that exact structural class rather than the broader rounded-xl cards
  // used elsewhere on this page.
  const submissionRow = page.locator("div.flex.items-center.justify-between.p-4").filter({ hasText: "E2E-ZAAD-REF" });
  await expect(submissionRow.getByText("PENDING", { exact: true })).toBeVisible();

  // --- Announcements: genuinely empty — nothing in this suite posts one. ---
  await page.getByRole("navigation").getByRole("link", { name: "Announcements" }).click();
  await expect(page).toHaveURL(/\/parent\/announcements/);
  await expect(page.getByText("No announcements yet")).toBeVisible();

  // --- Notifications: genuinely empty — nothing in this suite's flows
  // (ZAAD verify/reject, or an Announcement to PARENTS) has ever run for
  // this guardian, so this is the real state, not an assumption. ---
  await page.getByRole("navigation").getByRole("link", { name: "Notifications" }).click();
  await expect(page).toHaveURL(/\/parent\/notifications/);
  await expect(page.getByText("No notifications yet")).toBeVisible();

  // --- Profile: Amina's own info, not her child's. ---
  await page.getByRole("navigation").getByRole("link", { name: "Profile" }).click();
  await expect(page).toHaveURL(/\/parent\/profile/);
  await expect(page.getByText("Amina Ali")).toBeVisible();
  await expect(page.getByText("0611111111")).toBeVisible();
  await expect(page.getByText(PARENT.email)).toBeVisible();
  await expect(page.getByText("Portal account ACTIVE")).toBeVisible();

  await signOut(page);
});
