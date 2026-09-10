import { test, expect } from "@playwright/test";
import { generate } from "otplib";
import { loginAt, signOut } from "../fixtures/auth";
import { ADMIN } from "../fixtures/credentials";

// Full round trip: enable, sign out, log back in through the MFA challenge
// screen (wrong code rejected, right code accepted), then disable again so
// the fixture account is left the way every other test expects it —
// 2FA-disabled — regardless of run order.
test("enable 2FA, log in through the MFA challenge, then disable it again", async ({ page }) => {
  await loginAt(page, "/admin/login", ADMIN.email, ADMIN.password);
  await expect(page).toHaveURL(/\/dashboard/);

  await page.goto("/account");
  await page.getByRole("button", { name: "Enable" }).click();

  const secret = await page.locator("code").innerText();
  const code = await generate({ secret });
  await page.getByPlaceholder("123456").fill(code);
  await page.getByRole("button", { name: "Confirm" }).click();

  await expect(page.getByText("Save your recovery codes")).toBeVisible();
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Done" }).click();
  // Not just getByText: matches both the "Not enabled" badge (as a
  // substring) and the "Two-factor authentication enabled." toast.
  await expect(page.getByText("Enabled", { exact: true })).toBeVisible();

  await signOut(page);

  // Log back in — password alone must not be enough anymore.
  await loginAt(page, "/admin/login", ADMIN.email, ADMIN.password);
  await expect(page.getByLabel(/Authentication code/i)).toBeVisible();

  await page.getByPlaceholder("123456").fill("000000");
  await page.getByRole("button", { name: "Verify" }).click();
  await expect(page.getByText(/incorrect code/i)).toBeVisible();

  const loginCode = await generate({ secret });
  await page.getByPlaceholder("123456").fill(loginCode);
  await page.getByRole("button", { name: "Verify" }).click();
  await expect(page).toHaveURL(/\/dashboard/);

  // Clean up — leave the fixture account 2FA-disabled for other tests/runs.
  // Both the card's trigger button and the dialog's submit button are
  // labeled "Disable" — scope to the dialog for the second one.
  await page.goto("/account");
  await page.getByRole("button", { name: "Disable" }).click();
  const disableDialog = page.getByRole("dialog");
  await disableDialog.getByLabel("Current password").fill(ADMIN.password);
  await disableDialog.getByRole("button", { name: "Disable" }).click();
  await expect(page.getByText("Not enabled")).toBeVisible();
});
