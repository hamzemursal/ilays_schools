import { expect, type Page } from "@playwright/test";

export async function loginAt(page: Page, loginPath: string, email: string, password: string) {
  await page.goto(loginPath);
  await page.getByPlaceholder(/you@school\.com|Student Login ID/i).fill(email);
  // By id, not label: the adjacent "Show password" toggle button's
  // aria-label contains "password", so any non-exact getByLabel("Password")
  // match is ambiguous between the input and that button.
  await page.locator("#password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
}

export async function signOut(page: Page) {
  await page.getByRole("button", { name: "Account menu" }).click();
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/portal$/);
}
