import { test, expect } from "@playwright/test";
import { loginAt } from "../fixtures/auth";
import { ADMIN } from "../fixtures/credentials";

// There is no staff self-service leave portal in this codebase — creating a
// leave request requires hr.leave.manage (only Admin/HR roles have it), via
// an EmployeePicker that names *which* teacher or staff member the leave is
// for. So the real flow is: Admin creates the request on behalf of the
// seeded Teacher (Amran Hassan), then Admin approves it — see
// LeaveRequestsService and CreateLeaveRequestForm.tsx.
test("Admin submits a leave request for a Teacher and approves it", async ({ page }) => {
  await loginAt(page, "/admin/login", ADMIN.email, ADMIN.password);
  await expect(page).toHaveURL(/\/dashboard/);

  // "HR" isn't duplicated on the dashboard's Quick Links (unlike Students/My
  // classes/Finance), but scoping to the sidebar <nav> defensively costs
  // nothing and matches this suite's established convention.
  await page.getByRole("navigation").getByRole("link", { name: "HR" }).click();
  await expect(page).toHaveURL(/\/hr\/leave-requests/);

  await page.getByRole("button", { name: "New leave request" }).click();

  // No id/htmlFor/aria-label anywhere on this form — same gap as the exam
  // wizard and Finance. Employee is reliably the first <select> in DOM
  // order (Leave type is the second); Start/End date are the only two
  // date inputs, in that order.
  await page.getByRole("combobox").first().selectOption({ label: "Amran Hassan (EMP-0001)" });
  // Leave type defaults to "Annual" — left untouched.
  const dateInputs = page.locator('input[type="date"]');
  await dateInputs.first().fill("2027-04-01");
  await dateInputs.last().fill("2027-04-05");
  await page.getByRole("button", { name: "Submit request" }).click();

  // Fresh seed has exactly one employee (Amran Hassan) and no pre-existing
  // leave requests, so this row and its status badge are unambiguous.
  await expect(page.getByText("PENDING", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Approve" }).click();
  await expect(page.getByText("APPROVED", { exact: true })).toBeVisible();
});
