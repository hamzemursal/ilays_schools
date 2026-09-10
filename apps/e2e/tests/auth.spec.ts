import { test, expect } from "@playwright/test";
import { loginAt } from "../fixtures/auth";
import { ADMIN, SUPER_ADMIN, TEACHER, PARENT } from "../fixtures/credentials";

test("School Admin logs in and reaches the school dashboard", async ({ page }) => {
  await loginAt(page, "/admin/login", ADMIN.email, ADMIN.password);
  await expect(page).toHaveURL(/\/dashboard/);
  await expect(page.getByText("Saamalay Primary School").first()).toBeVisible();
});

test("Super Admin logs in and reaches the org dashboard", async ({ page }) => {
  await loginAt(page, "/super-admin/login", SUPER_ADMIN.email, SUPER_ADMIN.password);
  await expect(page).toHaveURL(/\/dashboard/);
  await expect(page.getByText("SUPER_ADMIN")).toBeVisible();
});

test("Teacher logs in and reaches the dashboard", async ({ page }) => {
  await loginAt(page, "/teacher/login", TEACHER.email, TEACHER.password);
  await expect(page).toHaveURL(/\/dashboard/);
});

test("Parent logs in and reaches the parent dashboard", async ({ page }) => {
  await loginAt(page, "/parent/login", PARENT.email, PARENT.password);
  await expect(page).toHaveURL(/\/parent/);
  // Not just getByText: a child switcher <select> also has an
  // "Hodan Ali — Class 1 · A" <option>, which contains this as a substring.
  await expect(page.getByText("Hodan Ali", { exact: true })).toBeVisible();
});

test("wrong password is rejected with a clear error, not a crash", async ({ page }) => {
  await loginAt(page, "/admin/login", ADMIN.email, "definitely-wrong-password");
  await expect(page.getByText(/invalid email or password/i)).toBeVisible();
  await expect(page).toHaveURL(/\/admin\/login/);
});

test("a Teacher account is rejected at the Super Admin login (allowedRoles guard)", async ({ page }) => {
  await loginAt(page, "/super-admin/login", TEACHER.email, TEACHER.password);
  // The super-admin login page passes its own wrongRoleMessage (see
  // apps/web/src/app/(auth)/super-admin/login/page.tsx) rather than
  // LoginForm's generic default.
  await expect(page.getByText(/isn.t a super admin account/i)).toBeVisible();
});
