import { test, expect } from "@playwright/test";
import { generate } from "otplib";
import { loginAt, signOut } from "../fixtures/auth";
import { ADMIN } from "../fixtures/credentials";

// MFA_LOGIN_ENFORCED is currently false (apps/api/src/auth/mfa-policy.ts):
// normal login never shows the "Authentication code" challenge, even for an
// account that has 2FA enabled. The underlying TOTP feature itself is
// untouched — enabling, disabling, and the /auth/totp/verify-login endpoint
// all still work exactly as before; this test proves the full real
// Account Settings round trip (enable -> recovery codes -> disable) still
// functions, and that a 2FA-enabled account is nonetheless NOT challenged
// at login while the policy is disabled.
//
// The "Authentication code" challenge screen itself — wrong code rejected,
// right code accepted — can no longer be reached through a real login while
// the policy is off, so that specific round trip is covered at the unit
// level instead: apps/api/src/auth/auth.service.mfa-enforced.spec.ts (the
// login() branch, with the policy mocked back to true) and
// apps/api/src/totp/totp.service.spec.ts (verifyLogin itself, unconditionally).
test("2FA can still be enabled/disabled via Account Settings, and does not gate normal login", async ({ page }) => {
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

  // Log back in — password alone is (still) enough, even though this
  // account now genuinely has 2FA enabled: the login-time challenge is
  // gated by MFA_LOGIN_ENFORCED, not by the account's own totpEnabledAt.
  await loginAt(page, "/admin/login", ADMIN.email, ADMIN.password);
  await expect(page).toHaveURL(/\/dashboard/);
  await expect(page.getByLabel(/Authentication code/i)).toHaveCount(0);

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
