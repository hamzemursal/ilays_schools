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

  await expect(page.getByText(schoolName)).toBeVisible();

  await page.getByText(schoolName).click();
  await expect(page).toHaveURL(/\/schools\/[a-f0-9-]+\/dashboard/);

  // Each StatCard is a "div.rounded-xl" containing its label ("Students",
  // "Teachers", …) and value as sibling <p> tags — see components/ui/StatCard.tsx.
  const studentsCard = page.locator("div.rounded-xl").filter({ hasText: "Students" });
  const teachersCard = page.locator("div.rounded-xl").filter({ hasText: "Teachers" });
  const classesCard = page.locator("div.rounded-xl").filter({ hasText: "Classes" });
  await expect(studentsCard.getByText("0", { exact: true })).toBeVisible();
  await expect(teachersCard.getByText("0", { exact: true })).toBeVisible();
  await expect(classesCard.getByText("0", { exact: true })).toBeVisible();
});
