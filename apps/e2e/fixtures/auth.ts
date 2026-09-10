import { expect, type Page } from "@playwright/test";
import { generate } from "otplib";

// Populated the first time an account completes 2FA setup (mandatory or
// voluntary), so a later loginAt call for the same email — a genuinely
// separate test; 2FA state persists in the one shared database for the
// whole CI run/worker — can get through the ordinary MFA challenge screen
// instead of hitting (and failing on) the one-time setup screen it no
// longer shows.
const totpSecretsByEmail = new Map<string, string>();

export async function loginAt(page: Page, loginPath: string, email: string, password: string) {
  await page.goto(loginPath);
  await page.getByPlaceholder(/you@school\.com|Student Login ID/i).fill(email);
  // By id, not label: the adjacent "Show password" toggle button's
  // aria-label contains "password", so any non-exact getByLabel("Password")
  // match is ambiguous between the input and that button.
  await page.locator("#password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();

  // SUPER_ADMIN/ORGANIZATION_ADMIN accounts are hard-gated into mandatory
  // 2FA setup on first login (AppShell's mustSetup2FA check, forced mode —
  // see TwoFactorSection) before they can reach anything else. Complete it
  // transparently here so every caller can assume a normal post-login
  // landing regardless of role; a no-op for every other account, which
  // never sees this screen.
  const setupGate = await page
    .getByText("Set up two-factor authentication")
    .waitFor({ state: "visible", timeout: 3000 })
    .then(() => true)
    .catch(() => false);
  if (setupGate) {
    const secret = await page.locator("code").innerText();
    totpSecretsByEmail.set(email, secret);
    const code = await generate({ secret });
    await page.getByPlaceholder("123456").fill(code);
    await page.getByRole("button", { name: "Confirm" }).click();
    await expect(page.getByText("Save your recovery codes")).toBeVisible();
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: "Done" }).click();
    return;
  }

  const knownSecret = totpSecretsByEmail.get(email);
  if (knownSecret) {
    const code = await generate({ secret: knownSecret });
    await page.getByPlaceholder("123456").fill(code);
    await page.getByRole("button", { name: "Verify" }).click();
  }
}

export async function signOut(page: Page) {
  await page.getByRole("button", { name: "Account menu" }).click();
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/portal$/);
}
