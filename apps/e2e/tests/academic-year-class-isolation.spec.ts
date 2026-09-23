import { test, expect } from "@playwright/test";
import { loginAt } from "../fixtures/auth";
import { ADMIN } from "../fixtures/credentials";

// Regression coverage for the "Class not found" bug: opening a class (or one
// of its sections) that belongs to a PREVIOUS academic year must work, not
// silently fail because the page re-validated the class against an
// unscoped (current-year-defaulted) list. This creates its own extra
// academic year and class via the real admin UI — nothing pre-seeded,
// nothing faked — then drills all the way down through the current
// year-scoped hierarchy:
//   Academic Years -> add a previous year -> open that year's own page ->
//   create a class in it -> open the class -> open one of its sections.
test.describe.configure({ timeout: 90_000 });

test("a class and section created in a non-current academic year remain reachable", async ({ page }) => {
  await loginAt(page, "/admin/login", ADMIN.email, ADMIN.password);
  await expect(page).toHaveURL(/\/dashboard/);

  await page.getByRole("complementary").getByRole("link", { name: "Academic" }).click();
  await page.waitForURL(/\/academic$/);
  await expect(page.getByRole("button", { name: "Years" })).toBeVisible();

  // --- Add a genuinely PREVIOUS academic year (2025, well before the
  // seeded "2027" which is current) via the real Create Academic Year modal. ---
  await page.getByRole("button", { name: "Create Academic Year" }).click();
  await page.getByLabel("Academic Year Name", { exact: false }).fill("2025");
  await page.getByLabel("Start Date", { exact: false }).fill("2025-01-01");
  await page.getByLabel("End Date", { exact: false }).fill("2025-12-31");
  await page.getByRole("dialog").getByRole("button", { name: "Create Academic Year" }).click();
  await expect(page.getByText("Academic year added.")).toBeVisible();

  // --- Open 2025's own page (the year-scoped hierarchy's entry point). ---
  await page.getByRole("link", { name: "Open 2025" }).click();
  await page.waitForURL(/\/academic\/years\/[^/]+$/);
  await expect(page.getByText("No classes yet for this year")).toBeVisible();

  // --- Create a class for 2025 via the real class wizard, reached from
  // this year's own "Create class" button. Both the header action and the
  // empty-state action point at the same wizard route when a year has no
  // classes yet, so pick the first match. ---
  await page.getByRole("link", { name: "Create class" }).first().click();
  await page.waitForURL(/\/academic\/classes\/new$/);

  const wizardYearSelect = page.locator("select").filter({ hasText: "2025" });
  await wizardYearSelect.selectOption({ label: "2025" });

  // Exactly one section, named "A".
  await page.locator('input[placeholder="A"]').fill("A");
  // Reuse the school's existing seeded subject rather than fabricating one.
  await page.getByText("Mathematics", { exact: true }).click();

  await page.getByRole("button", { name: "Save class" }).click();
  await expect(page.getByText("created successfully.")).toBeVisible();
  await page.getByRole("link", { name: "Back to Classes" }).click();
  await page.waitForURL(/\/academic$/);

  // --- Back to 2025's own page, open the class we just made. ---
  await page.getByRole("link", { name: "Open 2025" }).click();
  await page.waitForURL(/\/academic\/years\/[^/]+$/);

  // The wizard auto-numbers the class from the school's existing classes
  // (not from 1 per year), so assert on the pattern rather than a specific number.
  const classLink = page.getByRole("link", { name: /Class \d+/ });
  await expect(classLink).toHaveCount(1);
  await classLink.click();

  // --- Class detail page: this is the exact regression. Must show the
  // real class, never "Class not found". ---
  await expect(page).toHaveURL(/\/academic\/classes\/[^/]+\?year=/);
  await expect(page.getByText("Class not found")).toHaveCount(0);
  await expect(page.getByText("Sections", { exact: true })).toBeVisible();
  const sectionCard = page.locator("div", { hasText: "Section A" }).filter({ has: page.getByRole("link", { name: "View Section" }) });
  await expect(sectionCard.first()).toBeVisible();

  // --- Section workspace page: same regression, one level deeper. ---
  await sectionCard.first().getByRole("link", { name: "View Section" }).click();
  await expect(page).toHaveURL(/\/sections\/[^/?]+\?year=/);
  await expect(page.getByText("Section not found in this class")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Section A" })).toBeVisible();
});
