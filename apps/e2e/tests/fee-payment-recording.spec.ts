import { test, expect } from "@playwright/test";
import { loginAt } from "../fixtures/auth";
import { ADMIN } from "../fixtures/credentials";

// Charges/invoices are never created ad-hoc — they're always generated in
// bulk from a Fee Structure applied to every ACTIVE enrollment in an
// academic year (see FeeStructuresService/InvoicesService). No FeeStructure
// is seeded, so this test creates one, generates its invoice, and pays it —
// the seeded fixture Student (Hodan Ali) has the one ACTIVE enrollment in
// academic year 2027 that ends up billed.
test("Admin creates a fee structure, generates an invoice, and records a payment", async ({ page }) => {
  const feeName = `E2E Term Fee ${Date.now()}`;

  await loginAt(page, "/admin/login", ADMIN.email, ADMIN.password);
  await expect(page).toHaveURL(/\/dashboard/);

  // "Finance" also appears as its own "Quick links" card on this same
  // dashboard — scope to the sidebar <nav> to avoid that collision, same
  // pattern as "Students"/"My classes" elsewhere.
  await page.getByRole("navigation").getByRole("link", { name: "Finance" }).click();
  await expect(page).toHaveURL(/\/schools\/.+\/finance/);

  await page.getByRole("button", { name: "Fee Structures" }).click();

  // No id/htmlFor association anywhere in Finance's forms — placeholder
  // text is the only reliable anchor here (same gap as the exam-creation
  // wizard). Year already defaults to the current academic year (2027);
  // Class (optional) left as "Whole school" so it bills every class.
  await page.getByPlaceholder("Tuition Term 1").fill(feeName);
  await page.getByPlaceholder("150").fill("120");
  await page.getByRole("button", { name: "Add fee" }).click();

  // Scoped to this fee structure's own card (feeName is timestamp-unique):
  // on a fresh seed there's only one card anyway, but scoping defensively
  // matches this suite's established pattern for repeated-text elements.
  const feeCard = page.locator("div.rounded-xl").filter({ hasText: feeName });
  await expect(feeCard).toBeVisible();
  await feeCard.getByRole("button", { name: "Generate invoices" }).click();
  await expect(feeCard.getByText(/\d+ invoice\(s\) created/)).toBeVisible();

  await page.getByRole("button", { name: "Invoices" }).click();

  // Same scoping approach — the invoice card also carries the fee
  // structure's name.
  const invoiceCard = page.locator("div.rounded-xl").filter({ hasText: feeName });
  await invoiceCard.getByRole("button", { name: "Record payment" }).click();
  // Amount is pre-filled with the full outstanding balance; Method
  // defaults to Cash — pay it in full with the defaults.
  await invoiceCard.getByRole("button", { name: "Save payment" }).click();

  await expect(invoiceCard.getByText("PAID", { exact: true })).toBeVisible();
  await expect(invoiceCard.getByText("balance $0.00")).toBeVisible();
});
