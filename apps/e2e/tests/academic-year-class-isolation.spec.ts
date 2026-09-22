import { test, expect } from "@playwright/test";
import { loginAt } from "../fixtures/auth";
import { ADMIN } from "../fixtures/credentials";

// Regression coverage for the "Class not found" bug: opening a class (or one
// of its sections) that belongs to a PREVIOUS academic year must work, not
// silently fail because the page re-validated the class against an
// unscoped (current-year-defaulted) list. This creates its own extra
// academic year and class via the real admin UI — nothing pre-seeded,
// nothing faked — then drills all the way down:
//   Academic Years -> add a previous year -> Classes & Sections -> create a
//   class in that year -> open the class -> open one of its sections.
test.describe.configure({ timeout: 90_000 });

test("a class and section created in a non-current academic year remain reachable", async ({ page }) => {
  await loginAt(page, "/admin/login", ADMIN.email, ADMIN.password);
  await expect(page).toHaveURL(/\/dashboard/);

  await page.getByRole("complementary").getByRole("link", { name: "Academic" }).click();
  await page.waitForURL(/\/academic$/);
  await expect(page.getByRole("button", { name: "Years" })).toBeVisible();

  // --- Add a genuinely PREVIOUS academic year (2025, well before the
  // seeded "2027" which is current) via the real Add Academic Year form. ---
  await page.getByPlaceholder("2027").fill("2025");
  await page.locator('input[type="date"]').nth(0).fill("2025-01-01");
  await page.locator('input[type="date"]').nth(1).fill("2025-12-31");
  await page.getByRole("button", { name: "Add year" }).click();
  await expect(page.getByText("Academic year added.")).toBeVisible();

  // --- Classes & sections tab, switch to the new 2025 year. ---
  await page.getByRole("button", { name: "Classes & sections" }).click();
  const yearSelect = page.locator("select").filter({ hasText: "2025" });
  await yearSelect.selectOption({ label: "2025" });

  await expect(page.getByText("No classes yet")).toBeVisible();

  // --- Create a class for 2025 via the real class wizard. ---
  await page.getByRole("link", { name: "Create class" }).click();
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

  // --- Back on Classes & sections, 2025, open the class we just made. ---
  await page.getByRole("button", { name: "Classes & sections" }).click();
  await page.locator("select").filter({ hasText: "2025" }).selectOption({ label: "2025" });

  const classCard = page.locator("div.rounded-xl", { hasText: "View Sections" });
  await expect(classCard).toHaveCount(1);
  await classCard.getByRole("link", { name: "View Sections" }).click();

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
