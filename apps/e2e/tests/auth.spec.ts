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
  await expect(page.getByText("Hodan Ali")).toBeVisible();
});

test("wrong password is rejected with a clear error, not a crash", async ({ page }) => {
  await loginAt(page, "/admin/login", ADMIN.email, "definitely-wrong-password");
  await expect(page.getByText(/invalid email or password/i)).toBeVisible();
  await expect(page).toHaveURL(/\/admin\/login/);
});

test("a Teacher account is rejected at the Super Admin login (allowedRoles guard)", async ({ page }) => {
  await loginAt(page, "/super-admin/login", TEACHER.email, TEACHER.password);
  await expect(page.getByText(/doesn.t have access to this portal/i)).toBeVisible();
});
