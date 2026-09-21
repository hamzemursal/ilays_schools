import { test, expect, type Page } from "@playwright/test";
import { loginAt, signOut } from "../fixtures/auth";
import { ADMIN, SUPER_ADMIN } from "../fixtures/credentials";

// The Super Admin "Organization Control Center" shell, in a real browser: it
// looks like the organization (navy sidebar, Indigo actions, light content),
// every organization page still opens, the school selector works, and the
// School Admin keeps its own, unchanged design. Colors are asserted as
// COMPUTED styles so the scoped theme is proven to work in the production
// build, not just present in the stylesheet.

const NAVY = "rgb(11, 18, 32)"; // #0B1220
const INDIGO = "rgb(79, 70, 229)"; // #4F46E5
const SLATE_BG = "rgb(248, 250, 252)"; // #F8FAFC

// Optional evidence screenshots for a human reviewer (QA_SHOTS_DIR=/some/dir).
async function shot(page: Page, name: string) {
  if (process.env.QA_SHOTS_DIR) await page.screenshot({ path: `${process.env.QA_SHOTS_DIR}/${name}.png`, fullPage: false });
}

const css = (page: Page, selector: string, property: string) =>
  page.locator(selector).first().evaluate((el, prop) => getComputedStyle(el).getPropertyValue(prop), property);

test("Super Admin: Organization Control Center shell, colors, dashboard, navigation and selector", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await loginAt(page, "/super-admin/login", SUPER_ADMIN.email, SUPER_ADMIN.password);
  await expect(page).toHaveURL(/\/dashboard/);

  // --- identity: the organization, not a school ---
  const sidebar = page.getByRole("complementary");
  await expect(sidebar.getByText("Ilays Schools")).toBeVisible();
  await expect(sidebar.getByText("Super Admin", { exact: true }).first()).toBeVisible();
  await expect(sidebar.getByText("Organization Control Center")).toBeVisible();
  await expect(sidebar.getByText("Organization Administrator")).toBeVisible();
  await expect(sidebar.getByRole("button", { name: "Log out" })).toBeVisible();

  // --- the color system, as the browser actually computes it ---
  expect(await css(page, "aside > div", "background-color")).toBe(NAVY);
  expect(await css(page, '[data-theme="super-admin"]', "background-color")).toBe(SLATE_BG); // page canvas
  await expect(sidebar.getByRole("link", { name: "Dashboard" })).toHaveAttribute("aria-current", "page");
  expect(await sidebar.getByRole("link", { name: "Dashboard" }).evaluate((el) => getComputedStyle(el).backgroundColor)).toBe(INDIGO);
  // Primary actions are Indigo too (View Schools button on the dashboard).
  expect(await page.getByRole("button", { name: "View Schools" }).evaluate((el) => getComputedStyle(el).backgroundColor)).toBe(INDIGO);
  // The header and the cards stay light.
  expect(await css(page, "header", "background-color")).toBe("rgb(255, 255, 255)");

  // --- sidebar structure: only real routes, grouped ---
  for (const group of ["Overview", "Organization", "Academic", "Operations", "Governance"]) {
    await expect(sidebar.getByText(group, { exact: true })).toBeVisible();
  }
  for (const link of ["Dashboard", "Schools", "Exam Papers", "Exams & Results", "Student Lifecycle", "Transfers", "Central Finance", "Audit Log"]) {
    await expect(sidebar.getByRole("link", { name: link })).toBeVisible();
  }
  for (const missing of ["Users & Roles", "System Settings", "Academic Years", "Classes & Sections"]) {
    await expect(sidebar.getByText(missing)).toHaveCount(0);
  }

  // --- dashboard: real organization data ---
  await expect(page.getByRole("heading", { name: "Super Admin Command Center" })).toBeVisible();
  await expect(page.getByText("Organization overview")).toBeVisible();
  await expect(page.getByText("Manage and monitor all Ilays Schools from one place.")).toBeVisible();
  const cards = page.getByRole("region", { name: "Organization summary" });
  for (const label of ["Total schools", "Total students", "Total teachers", "Total staff"]) await expect(cards.getByText(label)).toBeVisible();
  await expect(page.getByText("Schools Overview")).toBeVisible();
  await expect(page.getByText("Saamalay Primary School").first()).toBeVisible(); // a real school from the database
  await expect(page.getByText("Recent Activity / Audit")).toBeVisible();
  await expect(page.locator("body")).not.toContainText(/this month|Welcome back/);
  // Existing account summary stays (roles + authorized schools).
  await expect(page.getByText("SUPER_ADMIN")).toBeVisible();
  await shot(page, "super-admin-dashboard");

  // --- header: organization breadcrumb, search, school selector ---
  await expect(page.getByRole("navigation", { name: "Breadcrumb" })).toContainText("Organization");
  await expect(page.getByRole("navigation", { name: "Breadcrumb" })).toContainText("Dashboard");
  await expect(page.getByPlaceholder("Search schools and pages…").or(page.getByText("Search schools and pages…"))).toBeVisible();
  const selector = page.getByRole("button", { name: "Switch school context" });
  await expect(selector).toContainText("All Schools");
  await selector.click();
  await expect(page.getByRole("menuitem", { name: /All Schools/ })).toHaveAttribute("aria-current", "true");
  await shot(page, "super-admin-school-selector");
  await page.getByRole("menuitem", { name: /Saamalay Primary School/ }).click();
  await expect(page).toHaveURL(/\/schools\/[0-9a-f-]{36}\/dashboard/);
  // Inside a school the header shows it, the sidebar stays the organization.
  await expect(page.getByRole("button", { name: "Switch school context" })).toContainText("Saamalay Primary School");
  await expect(sidebar.getByText("Organization Control Center")).toBeVisible();
  await expect(sidebar.getByText(/Selected school · Saamalay Primary School/)).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Breadcrumb" })).toContainText("Saamalay Primary School");
  await shot(page, "super-admin-inside-school");
  await page.getByRole("button", { name: "Switch school context" }).click();
  await page.getByRole("menuitem", { name: /All Schools/ }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole("heading", { name: "Super Admin Command Center" })).toBeVisible();

  // --- Ctrl K search finds real schools and pages ---
  await page.keyboard.press("Control+k");
  await page.getByPlaceholder("Search schools and pages…").fill("audit");
  await page.getByRole("button", { name: "Audit Log" }).click();
  await expect(page).toHaveURL(/\/audit-log/);

  // --- every organization page still opens from the sidebar ---
  const pages: Array<[string, RegExp]> = [
    ["Schools", /\/schools$/],
    ["Student Lifecycle", /\/student-lifecycle/],
    ["Transfers", /\/transfers/],
    ["Exams & Results", /\/results-review/],
    ["Exam Papers", /\/exam-papers/],
    ["Central Finance", /\/finance/],
    ["Audit Log", /\/audit-log/],
    ["Dashboard", /\/dashboard$/],
  ];
  for (const [name, url] of pages) {
    await sidebar.getByRole("link", { name, exact: true }).click();
    await expect(page).toHaveURL(url);
    await expect(sidebar.getByRole("link", { name, exact: true })).toHaveAttribute("aria-current", "page");
    // Indigo stays the action color on every Super Admin page.
    expect(await css(page, '[data-theme="super-admin"]', "--accent")).toBe("#4f46e5");
  }
  await sidebar.getByRole("link", { name: "Schools", exact: true }).click();
  await expect(page.getByRole("button", { name: "New school" })).toBeVisible();
  await shot(page, "super-admin-schools-page");

  // --- logout still works ---
  await sidebar.getByRole("button", { name: "Log out" }).click();
  await expect(page).toHaveURL(/\/portal$/);
});

test("Super Admin: the account menu still signs out (same control every role has always used)", async ({ page }) => {
  await loginAt(page, "/super-admin/login", SUPER_ADMIN.email, SUPER_ADMIN.password);
  await expect(page).toHaveURL(/\/dashboard/);
  await signOut(page);
});

test("School Admin keeps its own design and never gets the Super Admin shell", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await loginAt(page, "/admin/login", ADMIN.email, ADMIN.password);
  await expect(page).toHaveURL(/\/dashboard/);

  // No Super Admin theme anywhere, and the original palette is in force.
  await expect(page.locator('[data-theme="super-admin"]')).toHaveCount(0);
  const sidebar = page.getByRole("complementary");
  await expect(sidebar.getByText("Organization Control Center")).toHaveCount(0);
  await expect(sidebar.getByText("Super Admin")).toHaveCount(0);
  expect(await css(page, "aside > div", "background-color")).toBe("rgb(255, 255, 255)"); // still the white sidebar
  // The original blue accent token is still the School Admin's (Indigo is scoped away from it).
  expect(await page.locator("aside").first().evaluate((el) => getComputedStyle(el).getPropertyValue("--accent").trim())).toBe("#2456e5");
  expect(await page.locator("aside").first().evaluate((el) => getComputedStyle(el).getPropertyValue("--surface").trim())).toBe("#f5f6f9");
  // The school-scoped menu and school branding are unchanged.
  await expect(sidebar.getByText("Saamalay Primary School")).toBeVisible();
  await expect(sidebar.getByText("Main menu")).toBeVisible();
  // No Super Admin-only pages in a School Admin's navigation.
  await expect(sidebar.getByRole("link", { name: "Central Finance" })).toHaveCount(0);
  await expect(sidebar.getByRole("link", { name: "Schools", exact: true })).toHaveCount(0);
  await shot(page, "school-admin-dashboard-unchanged");
});
