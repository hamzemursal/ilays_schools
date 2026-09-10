import { expect, type Page } from "@playwright/test";

export async function loginAt(page: Page, loginPath: string, email: string, password: string) {
  await page.goto(loginPath);
  await page.getByPlaceholder(/you@school\.com|Student Login ID/i).fill(email);
  // Not exact: the required-field marker is aria-hidden but some browser/
  // Playwright accname combinations still fold it into the computed name.
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
}

export async function signOut(page: Page) {
  await page.getByRole("button", { name: "Account menu" }).click();
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/portal$/);
}
