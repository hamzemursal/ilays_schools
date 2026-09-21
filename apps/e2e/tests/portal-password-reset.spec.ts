import { test, expect } from "@playwright/test";
import { loginAt, signOut } from "../fixtures/auth";
import { ADMIN, PARENT } from "../fixtures/credentials";

// Amina Ali (the seeded PARENT of Hodan Ali) already has a portal login. An
// Admin resets that login's password from her Parent profile: it must act on
// the SAME account (no second Amina, no second login), the old password must
// stop working, and the temporary one must force a password change before
// anything else is reachable. Her original password is restored at the end so
// every other spec still finds the account exactly as seeded.
test("Admin resets a parent's portal password: same account, old password dead, must change on next login", async ({ page }) => {
  await loginAt(page, "/admin/login", ADMIN.email, ADMIN.password);
  await expect(page).toHaveURL(/\/dashboard/);

  await page.getByRole("navigation").getByRole("link", { name: "Parents" }).click();
  const aminaRows = page.getByRole("row", { name: /Amina Ali/ });
  await expect(aminaRows).toHaveCount(1);
  await aminaRows.getByRole("button", { name: "View" }).click();

  // She already has a login: the profile offers a reset, never a second account.
  await expect(page.getByText("Reset portal password")).toBeVisible();
  await expect(page.getByRole("button", { name: "Create Portal Account" })).toHaveCount(0);

  await page.getByRole("button", { name: "Reset password" }).click();
  await page.getByRole("button", { name: "Reset password" }).last().click(); // the confirmation dialog
  await expect(page.getByText(/Password reset — share these with Amina Ali now/)).toBeVisible();
  const line = await page.getByText(/Temporary password:/).innerText();
  const temporaryPassword = line.split("Temporary password:")[1].trim();
  expect(temporaryPassword.length).toBeGreaterThanOrEqual(12);

  // Still exactly one Amina Ali (no duplicate person / account created by the reset).
  await page.getByRole("complementary").getByRole("link", { name: "Parents" }).click(); // sidebar (the breadcrumb has one too)
  await expect(page.getByRole("row", { name: /Amina Ali/ })).toHaveCount(1);

  await signOut(page);

  // The old password no longer works...
  await loginAt(page, "/parent/login", PARENT.email, PARENT.password);
  await expect(page.getByText(/invalid email or password/i)).toBeVisible();

  // ...the temporary one signs in but is held at the forced change-password gate.
  await loginAt(page, "/parent/login", PARENT.email, temporaryPassword);
  await expect(page.getByText(/temporary password\. Choose a new one to continue/i)).toBeVisible();
  await expect(page.getByText("Hodan Ali", { exact: true })).toHaveCount(0);

  // Choosing her own password (here: the original, to leave the fixture as found) releases the gate.
  // (The form's labels aren't bound to their inputs, so address them in order:
  // temporary password, new password, confirm new password.)
  const fields = page.locator('input[type="password"]');
  await expect(fields).toHaveCount(3);
  await fields.nth(0).fill(temporaryPassword);
  await fields.nth(1).fill(PARENT.password);
  await fields.nth(2).fill(PARENT.password);
  await page.getByRole("button", { name: "Set new password" }).click();

  await expect(page.getByText("Hodan Ali", { exact: true })).toBeVisible();
});
