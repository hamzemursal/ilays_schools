import { test, expect } from "@playwright/test";
import { loginAt } from "../fixtures/auth";
import { SUPER_ADMIN } from "../fixtures/credentials";

// Encodes one of the platform's non-negotiable rules (see the architecture
// blueprint's "Guardrails" callout): creating a school must never
// auto-populate fake teachers, students, or sections.
test("Super Admin creates a school with zero auto-seeded students/teachers", async ({ page }) => {
  const schoolName = `E2E Test School ${Date.now()}`;

  await loginAt(page, "/super-admin/login", SUPER_ADMIN.email, SUPER_ADMIN.password);
  await expect(page).toHaveURL(/\/dashboard/);

  await page.goto("/schools");
  await page.getByRole("button", { name: "New school" }).click();
  // By id, not label: exact-match getByLabel on a required field has
  // proven unreliable in CI (see the Password field saga in loginAt/git
  // history) even with the asterisk marked aria-hidden — same fix that
  // resolved it there.
  await page.locator("#new-school-name").fill(schoolName);
  await page.getByRole("button", { name: "Create school" }).click();

  // Not just getByText: a "<name> created." toast also contains this as a
  // substring while it's still visible.
  await expect(page.getByText(schoolName, { exact: true })).toBeVisible();

  // The school's name itself isn't a link — only the card's own "View
  // School" button is (rendered as a Button nested inside a Link, same
  // ambiguous-role case as "Add student" elsewhere — match on visible text).
  // Scoped to this school's own card since every card has one.
  const schoolCard = page.locator("div.rounded-xl").filter({ hasText: schoolName });
  await schoolCard.getByText("View School", { exact: true }).click();

  // "View School" lands on the school's own detail page, not its
  // dashboard — that's one more click away, on an "Open school dashboard"
  // card (see apps/web/src/app/(app)/schools/[id]/page.tsx).
  await page.getByText("Open school dashboard", { exact: true }).click();
  await expect(page).toHaveURL(/\/schools\/[a-f0-9-]+\/dashboard/);

  // Each StatCard is a "div.rounded-xl.p-4" (see components/ui/StatCard.tsx)
  // containing its label and value. The "Academic" card further down this
  // same page has its own "Classes" field with an identically-styled <p>
  // label ("text-xs font-medium uppercase tracking-wide text-foreground-muted",
  // same as StatCard's), so hasText or a bare <p> filter alone can't tell
  // the two apart — but that card uses Card's own padding (p-5 or none),
  // never StatCard's specific p-4, so scope to that class first.
  const statCard = (label: string) => page.locator("div.rounded-xl.p-4").filter({ hasText: label });
  const studentsCard = statCard("Students");
  const teachersCard = statCard("Teachers");
  const classesCard = statCard("Classes");
  await expect(studentsCard.getByText("0", { exact: true })).toBeVisible();
  await expect(teachersCard.getByText("0", { exact: true })).toBeVisible();
  await expect(classesCard.getByText("0", { exact: true })).toBeVisible();
});
