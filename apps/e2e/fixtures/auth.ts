import { expect, type Page } from "@playwright/test";
import { generate } from "otplib";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";

// Persisted to a file, not just an in-memory module map: Playwright doesn't
// guarantee module state survives across different spec *files* even with
// workers: 1 (each file can run in its own worker process), but 2FA state
// itself persists in the one shared database for the whole CI run — so an
// account that completed setup in one file's test still needs its secret
// available to a later file's test logging into the same account. workers:
// 1 also means genuinely sequential execution, so no concurrent-write race
// on this file.
const SECRETS_FILE = join(__dirname, ".totp-secrets.json");

function readSecrets(): Record<string, string> {
  if (!existsSync(SECRETS_FILE)) return {};
  try {
    return JSON.parse(readFileSync(SECRETS_FILE, "utf-8"));
  } catch {
    return {};
  }
}

function rememberSecret(email: string, secret: string) {
  const secrets = readSecrets();
  secrets[email] = secret;
  writeFileSync(SECRETS_FILE, JSON.stringify(secrets));
}

export async function loginAt(page: Page, loginPath: string, email: string, password: string) {
  await page.goto(loginPath);
  await page.getByPlaceholder(/you@school\.com|Student Login ID|STU-\d{4}-\d{5}/i).fill(email);
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
    rememberSecret(email, secret);
    const code = await generate({ secret });
    await page.getByPlaceholder("123456").fill(code);
    await page.getByRole("button", { name: "Confirm" }).click();
    await expect(page.getByText("Save your recovery codes")).toBeVisible();
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: "Done" }).click();
    return;
  }

  // A secret remembered from an earlier run doesn't guarantee the
  // Authentication code screen is showing NOW — MFA_LOGIN_ENFORCED
  // (apps/api/src/auth/mfa-policy.ts) can disable the login-time challenge
  // even for an account that genuinely has 2FA enabled, so check the field
  // is actually there before trying to fill it, the same way the
  // mandatory-setup branch above already checks for its own screen.
  const knownSecret = readSecrets()[email];
  if (knownSecret) {
    const codeField = page.getByPlaceholder("123456");
    const challengeShown = await codeField
      .waitFor({ state: "visible", timeout: 3000 })
      .then(() => true)
      .catch(() => false);
    if (challengeShown) {
      const code = await generate({ secret: knownSecret });
      await codeField.fill(code);
      await page.getByRole("button", { name: "Verify" }).click();
    }
  }
}

export async function signOut(page: Page) {
  await page.getByRole("button", { name: "Account menu" }).click();
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/portal$/);
}
