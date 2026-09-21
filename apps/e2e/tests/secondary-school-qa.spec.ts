import { test, expect, type APIRequestContext, type Page } from "@playwright/test";
import { loginAt, signOut } from "../fixtures/auth";
import {
  SECONDARY_ADMIN,
  SECONDARY_OTHER_PARENT,
  SECONDARY_PARENT,
  SECONDARY_STUDENT_NUMBERS,
  SECONDARY_TEACHER,
} from "../fixtures/credentials";

// End-to-end QA of the exam -> marks -> results -> portals chain in the
// SECOND fixture organization (a SECONDARY school - the only place a Student
// Portal login can exist). One serial story so each step uses the real data
// the previous one created; nothing is mocked and nothing is inserted behind
// the app's back except the seed (see seedSecondaryQaFixtures).
//
//   Ayaan Warsame, Bilan Noor, Cali Jama - Form 1 A, 2027.
//   Teacher Abdi Mohamud teaches ONLY Mathematics there.
//   Term 1 exam: /50, pass 25.   Term 2 exam: /50, pass 20.
// Generous per-test budget: several steps sign in three or four times, and CI is slower than a laptop.
test.describe.configure({ mode: "serial", timeout: 120_000 });

const API = "http://localhost:4000/api/v1";
const stamp = Date.now();
const TERM1_EXAM = `QA Term 1 Exam ${stamp}`;
const TERM2_EXAM = `QA Term 2 Exam ${stamp}`;

// State handed from one step of the story to the next.
const story: { studentTemp?: string; studentPassword?: string } = {};

async function apiLogin(request: APIRequestContext, creds: { email: string; password: string }) {
  const res = await request.post(`${API}/auth/login`, { data: creds });
  expect(res.ok(), `API login for ${creds.email}`).toBeTruthy();
  return (await res.json()).accessToken as string;
}

const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

// The Create Exam wizard, driven exactly as an Admin would.
async function createExam(page: Page, name: string, termLabel: "Term 1 (50%)" | "Term 2 (50%)", max: string, pass: string, date: string) {
  await page.getByRole("complementary").getByRole("link", { name: "Academic" }).click();
  await page.getByRole("button", { name: "Exams" }).click();
  await page.getByText("Create Exam", { exact: true }).click();

  await page.getByPlaceholder("e.g. Term 1 Exam 2027").fill(name);
  await page.locator("#examTermId").selectOption({ label: termLabel });
  await page.getByRole("button", { name: "Next" }).click();

  await page.getByRole("button", { name: "Select All" }).first().click(); // Form 1
  await expect(page.getByText("Mathematics", { exact: true })).toBeVisible();
  await page.getByRole("checkbox", { name: "Mathematics" }).check();
  await page.getByRole("button", { name: "Next" }).click();

  const numbers = page.locator('input[type="number"]');
  await numbers.nth(0).fill(max);
  await numbers.nth(1).fill(pass);
  await page.locator('input[type="date"]').fill(date);
  await page.getByRole("button", { name: "Next" }).click();

  await page.getByRole("button", { name: "Create Exam" }).click();
  await expect(page.getByText("Exam created", { exact: true })).toBeVisible();
}

// A labelled value in the exam-context grid (results page or dialog).
const contextValue = (scope: Page | ReturnType<Page["getByRole"]>, label: string) =>
  scope.getByText(label, { exact: true }).locator("xpath=following-sibling::dd[1]");

async function openResultsFromMyExams(page: Page, examName: string) {
  await page.goto("/my-exams");
  await page.getByRole("row", { name: new RegExp(examName) }).getByRole("button", { name: /Enter Results|View Results/ }).click();
  await expect(page).toHaveURL(/\/schools\/.+\/exam-subjects\/.+\/sections\/.+\/results/);
}

test("1. Admin configures an exam: Term 1 or Term 2 only, no Exam Type, Maximum Marks and Pass Mark set", async ({ page }) => {
  await loginAt(page, "/admin/login", SECONDARY_ADMIN.email, SECONDARY_ADMIN.password);
  await expect(page).toHaveURL(/\/dashboard/);

  await page.getByRole("complementary").getByRole("link", { name: "Academic" }).click();
  await page.getByRole("button", { name: "Exams" }).click();
  await page.getByText("Create Exam", { exact: true }).click();

  // The academic period is Term 1 or Term 2 - exactly two - and there is no
  // Exam Type control (no Mid-Term, no Assignment) anywhere in the form.
  await expect(page.locator("#examTermId option")).toHaveText(["Select…", "Term 1 (50%)", "Term 2 (50%)"]);
  for (const forbidden of ["Exam Type", "Mid-Term", "Midterm", "Assignment", "Term 3"]) {
    await expect(page.getByText(forbidden, { exact: false })).toHaveCount(0);
  }
  await page.goto("/dashboard");

  await createExam(page, TERM1_EXAM, "Term 1 (50%)", "50", "20", "2027-03-01");

  // The exam list shows the Admin's configuration.
  await page.getByRole("complementary").getByRole("link", { name: "Academic" }).click();
  await page.getByRole("button", { name: "Exams" }).click();
  await expect(page.getByRole("heading", { name: TERM1_EXAM })).toBeVisible();
  await expect(page.getByText("Form 1 · Mathematics · /50").first()).toBeVisible();
  await expect(page.getByText("Pass 20").first()).toBeVisible();
  await expect(page.getByText("Term 1", { exact: true }).first()).toBeVisible();

  // Editing: the pass mark can never exceed the maximum...
  await page.getByRole("button", { name: "Edit marks for Form 1 Mathematics" }).first().click();
  await page.getByLabel("Pass mark for Form 1 Mathematics").fill("80");
  await expect(page.getByText("Pass mark can't be higher than the maximum marks.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Save", exact: true })).toBeDisabled();
  // ...but a valid correction saves.
  await page.getByLabel("Pass mark for Form 1 Mathematics").fill("25");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("Pass 25").first()).toBeVisible();
});

test("2. Teacher sees the full exam context, enters, validates, saves, edits and submits marks", async ({ page, request }) => {
  await loginAt(page, "/teacher/login", SECONDARY_TEACHER.email, SECONDARY_TEACHER.password);
  await expect(page).toHaveURL(/\/dashboard/);
  await openResultsFromMyExams(page, TERM1_EXAM);

  // --- context: everything a teacher needs to know about what they are marking ---
  await expect(contextValue(page, "Exam Name")).toHaveText(TERM1_EXAM);
  await expect(contextValue(page, "Subject")).toHaveText("Mathematics");
  await expect(contextValue(page, "Class")).toHaveText("Form 1");
  await expect(contextValue(page, "Section")).toHaveText("A");
  await expect(contextValue(page, "Academic Year")).toHaveText("2027");
  await expect(contextValue(page, "Term")).toHaveText("Term 1");
  await expect(contextValue(page, "Exam Date")).not.toHaveText("Not set");
  await expect(contextValue(page, "Maximum Marks")).toHaveText("50");
  await expect(contextValue(page, "Pass Mark")).toHaveText("25");
  await expect(contextValue(page, "Status")).toHaveText("Draft");
  // A teacher can only enter marks - there is nothing to edit Maximum/Pass with.
  await expect(page.getByLabel(/maximum marks|pass mark/i)).toHaveCount(0);

  // --- validation the teacher can SEE ---
  const bilan = page.getByLabel("Mark for Bilan Noor");
  await bilan.fill("51");
  await expect(page.getByText("Above the maximum of 50")).toBeVisible();
  await expect(page.getByRole("button", { name: "Save Draft" })).toBeDisabled();
  await bilan.fill("-3");
  await expect(page.getByText("A mark can't be negative")).toBeVisible();
  await expect(page.getByRole("button", { name: "Save Draft" })).toBeDisabled();

  // --- valid marks; Cali is Absent (a status, not a 0) ---
  await page.getByLabel("Mark for Ayaan Warsame").fill("45");
  await bilan.fill("30");
  await page.getByLabel("Absent: Cali Jama").check();
  await page.getByRole("button", { name: "Save Draft" }).click();
  await expect(page.getByText("Saved.")).toBeVisible();

  // Persisted: reload and the same values (and the Absent status) come back.
  await page.reload();
  await expect(page.getByLabel("Mark for Ayaan Warsame")).toHaveValue("45");
  await expect(page.getByLabel("Mark for Bilan Noor")).toHaveValue("30");
  await expect(page.getByLabel("Absent: Cali Jama")).toBeChecked();
  await expect(page.getByLabel("Mark for Cali Jama")).toHaveValue("");

  // --- the BACKEND enforces the same rules whatever the UI does ---
  const [, schoolId, , examSubjectId, , sectionId] = new URL(page.url()).pathname.split("/").filter(Boolean).slice(0, 6).concat([""]);
  const path = `${API}/schools/${schoolId}/exams/x/subjects/${examSubjectId}/sections/${sectionId}/results`;
  const token = await apiLogin(request, SECONDARY_TEACHER);
  const roster = await (await request.get(path, { headers: bearer(token) })).json();
  const enrollmentOf = (first: string) => roster.students.find((s: { firstName: string }) => s.firstName === first).enrollmentId as string;
  const post = (entry: object) => request.post(path, { headers: bearer(token), data: { entries: [entry] } });

  const tooHigh = await post({ enrollmentId: enrollmentOf("Bilan"), marksObtained: 51 });
  expect(tooHigh.status()).toBe(400);
  expect((await tooHigh.json()).message).toBe("Bilan Noor (#2): 51 is above the maximum of 50");
  const negative = await post({ enrollmentId: enrollmentOf("Bilan"), marksObtained: -1 });
  expect(negative.status()).toBe(400);
  expect(JSON.stringify((await negative.json()).message)).toMatch(/negative/);
  const both = await post({ enrollmentId: enrollmentOf("Cali"), isAbsent: true, marksObtained: 0 });
  expect(both.status()).toBe(400);
  expect((await both.json()).message).toMatch(/Cali Jama \(#3\) can't be both absent and have a mark/);
  // Absent really is stored as "no mark", not 0.
  const cali = roster.students.find((s: { firstName: string }) => s.firstName === "Cali");
  expect(cali).toMatchObject({ isAbsent: true, marksObtained: null, hasMark: false });
  // ...and nothing invalid changed what was saved.
  const after = await (await request.get(path, { headers: bearer(token) })).json();
  expect(after.students.find((s: { firstName: string }) => s.firstName === "Bilan").marksObtained).toBe("30");

  // --- the teacher edits a saved mark ---
  await page.getByLabel("Mark for Bilan Noor").fill("35");
  await page.getByRole("button", { name: "Save Draft" }).click();
  await expect(page.getByText("Saved.")).toBeVisible();

  // --- Submit for Review: same context + the four counts ---
  await page.getByRole("button", { name: "Submit for Review" }).click();
  const dialog = page.getByRole("alertdialog");
  await expect(contextValue(dialog, "Exam Name")).toHaveText(TERM1_EXAM);
  await expect(contextValue(dialog, "Subject")).toHaveText("Mathematics");
  await expect(contextValue(dialog, "Class")).toHaveText("Form 1");
  await expect(contextValue(dialog, "Section")).toHaveText("A");
  await expect(contextValue(dialog, "Academic Year")).toHaveText("2027");
  await expect(contextValue(dialog, "Term")).toHaveText("Term 1");
  await expect(contextValue(dialog, "Maximum Marks")).toHaveText("50");
  await expect(contextValue(dialog, "Pass Mark")).toHaveText("25");
  await expect(contextValue(dialog, "Students")).toHaveText("3");
  await expect(contextValue(dialog, "Completed marks")).toHaveText("2");
  await expect(contextValue(dialog, "Absent")).toHaveText("1");
  await expect(contextValue(dialog, "Missing marks")).toHaveText("0");
  await dialog.getByRole("checkbox").check();
  await dialog.getByRole("button", { name: "Submit for Review" }).click();
  await expect(page.getByText("Submitted — waiting for Admin review.")).toBeVisible();
});

// One helper for the Admin's Results Review -> approve -> publish sequence.
async function adminApproveAndPublish(page: Page, examName: string) {
  await page.getByRole("complementary").getByRole("link", { name: "Results Review" }).click();
  await page.getByRole("link", { name: examName }).click();

  await page.getByRole("button", { name: "Approve Results" }).click();
  let dialog = page.getByRole("alertdialog");
  await dialog.getByRole("checkbox").check();
  await dialog.getByRole("button", { name: "Approve Results" }).click();
  await expect(page.getByText("Approved — waiting to be published.").or(page.getByRole("button", { name: "Publish Results" }))).toBeVisible();

  await page.getByRole("button", { name: "Publish Results" }).click();
  dialog = page.getByRole("alertdialog");
  await dialog.getByRole("checkbox").check();
  await dialog.getByRole("button", { name: "Publish Results" }).click();
  await expect(page.getByText("Published — visible to students and parents.")).toBeVisible();
}

test("3. Admin reviews, corrects a mark (with a reason), resubmits, approves and publishes - and every change is in the audit trail", async ({ page, request }) => {
  await loginAt(page, "/admin/login", SECONDARY_ADMIN.email, SECONDARY_ADMIN.password);
  await expect(page).toHaveURL(/\/dashboard/);

  await page.getByRole("complementary").getByRole("link", { name: "Results Review" }).click();
  await page.getByRole("link", { name: TERM1_EXAM }).click();
  await expect(contextValue(page, "Status")).toHaveText("Pending Review");
  // While it is under review the marks are not editable.
  await expect(page.getByLabel("Mark for Bilan Noor")).toBeDisabled();

  // Send it back with a reason, then correct Bilan's mark as the Admin.
  await page.getByRole("button", { name: "Return for Correction" }).click();
  const returnDialog = page.getByRole("alertdialog");
  await returnDialog.getByRole("combobox").selectOption("Other");
  await returnDialog.getByRole("textbox").fill("Bilan's script was re-marked: 35 should be 38.");
  await returnDialog.getByRole("button", { name: "Return for Correction" }).click();
  await expect(page.getByText("Correction Required")).toBeVisible();

  const bilan = page.getByLabel("Mark for Bilan Noor");
  await expect(bilan).toBeEnabled();
  await bilan.fill("60"); // above the maximum: blocked for an Admin exactly as for a Teacher
  await expect(page.getByText("Above the maximum of 50")).toBeVisible();
  await expect(page.getByRole("button", { name: "Save Draft" })).toBeDisabled();
  await bilan.fill("38");
  await page.getByRole("button", { name: "Save Draft" }).click();
  await expect(page.getByText("Saved.")).toBeVisible();

  await page.getByRole("button", { name: "Resubmit for Review" }).click();
  const resubmit = page.getByRole("alertdialog");
  await resubmit.getByRole("checkbox").check();
  await resubmit.getByRole("button", { name: "Resubmit for Review" }).click();
  await expect(contextValue(page, "Status")).toHaveText("Pending Review");

  await page.getByRole("button", { name: "Approve Results" }).click();
  const approve = page.getByRole("alertdialog");
  await approve.getByRole("checkbox").check();
  await approve.getByRole("button", { name: "Approve Results" }).click();
  await page.getByRole("button", { name: "Publish Results" }).click();
  const publish = page.getByRole("alertdialog");
  await publish.getByRole("checkbox").check();
  await publish.getByRole("button", { name: "Publish Results" }).click();
  await expect(page.getByText("Published — visible to students and parents.")).toBeVisible();

  // --- the audit trail: student, exam, subject, old -> new, actor, time, reason ---
  const schoolId = new URL(page.url()).pathname.split("/")[2];
  const token = await apiLogin(request, SECONDARY_ADMIN);
  const logs = (await (await request.get(`${API}/schools/${schoolId}/audit-logs?action=RESULTS_CORRECTED`, { headers: bearer(token) })).json()) as Array<{
    resourceNameSnapshot: string;
    reason: string | null;
    actorEmail: string;
    createdAt: string;
    after: { subjectName: string; className: string; examName: string; changes: Array<{ studentName: string; oldMark: number | string | null; newMark: number | string }> };
  }>;
  const forThisExam = logs.filter((l) => l.resourceNameSnapshot.includes(TERM1_EXAM)).reverse(); // oldest first
  expect(forThisExam).toHaveLength(2);

  const [teacherEdit, adminEdit] = forThisExam;
  expect(teacherEdit.actorEmail).toBe(SECONDARY_TEACHER.email);
  expect(teacherEdit.after.changes).toEqual([expect.objectContaining({ studentName: "Bilan Noor", oldMark: 30, newMark: 35 })]);

  expect(adminEdit.actorEmail).toBe(SECONDARY_ADMIN.email);
  expect(adminEdit.after.changes).toEqual([expect.objectContaining({ studentName: "Bilan Noor", oldMark: 35, newMark: 38 })]);
  expect(adminEdit.after).toMatchObject({ examName: TERM1_EXAM, subjectName: "Mathematics", className: "Form 1" });
  expect(adminEdit.reason).toBe("Bilan's script was re-marked: 35 should be 38.");
  expect(new Date(adminEdit.createdAt).getTime()).toBeGreaterThan(new Date(teacherEdit.createdAt).getTime());
});

test("4. Term 2 exam: Admin creates it, Teacher marks it, Admin publishes it", async ({ page }) => {
  await loginAt(page, "/admin/login", SECONDARY_ADMIN.email, SECONDARY_ADMIN.password);
  await expect(page).toHaveURL(/\/dashboard/);
  await createExam(page, TERM2_EXAM, "Term 2 (50%)", "50", "20", "2027-08-01");
  await signOut(page);

  await loginAt(page, "/teacher/login", SECONDARY_TEACHER.email, SECONDARY_TEACHER.password);
  await openResultsFromMyExams(page, TERM2_EXAM);
  await expect(contextValue(page, "Term")).toHaveText("Term 2");
  await page.getByLabel("Mark for Ayaan Warsame").fill("30");
  await page.getByLabel("Mark for Bilan Noor").fill("40");
  await page.getByLabel("Mark for Cali Jama").fill("20");
  await page.getByRole("button", { name: "Submit for Review" }).click();
  const dialog = page.getByRole("alertdialog");
  await expect(contextValue(dialog, "Completed marks")).toHaveText("3");
  await expect(contextValue(dialog, "Absent")).toHaveText("0");
  await expect(contextValue(dialog, "Missing marks")).toHaveText("0");
  await dialog.getByRole("checkbox").check();
  await dialog.getByRole("button", { name: "Submit for Review" }).click();
  await expect(page.getByText("Submitted — waiting for Admin review.")).toBeVisible();
  await signOut(page);

  await loginAt(page, "/admin/login", SECONDARY_ADMIN.email, SECONDARY_ADMIN.password);
  await adminApproveAndPublish(page, TERM2_EXAM);
});

// Optional evidence screenshots for a human reviewer (QA_SHOTS_DIR=/some/dir).
async function shot(page: Page, name: string) {
  if (process.env.QA_SHOTS_DIR) await page.screenshot({ path: `${process.env.QA_SHOTS_DIR}/${name}.png`, fullPage: true });
}

async function openStudentProfile(page: Page, fullName: string) {
  await page.getByRole("complementary").getByRole("link", { name: "Students" }).click();
  await page.getByText(fullName, { exact: false }).first().click();
  await expect(page.getByText("Student Portal account").or(page.getByText("Reset portal password"))).toBeVisible();
}

// What a Student or Parent sees on their results page for one child.
async function expectTermResults(
  page: Page,
  expected: { term1: { exam: string; row: string; result: string }; term2: { exam: string; row: string; result: string }; annual: string; notThese: string[] },
) {
  // Top summary: Term 1 Result, Term 2 Result, Annual / Combined Result.
  const summary = page.getByRole("heading", { name: "Annual result" }).locator("xpath=ancestor::div[contains(@class,'rounded')][1]");
  await expect(summary.getByText("Term 1 Result")).toBeVisible();
  await expect(summary.getByText("Term 2 Result")).toBeVisible();
  await expect(summary.getByText("Annual / Combined Result")).toBeVisible();
  await expect(summary.getByText(expected.term1.result, { exact: true })).toBeVisible();
  await expect(summary.getByText(expected.term2.result, { exact: true })).toBeVisible();
  await expect(summary.getByText(expected.annual, { exact: true })).toBeVisible();

  // Exactly two independent term sections; each holds ONLY its own term's rows.
  const tables = page.getByRole("table");
  await expect(tables).toHaveCount(2);
  await expect(tables.nth(0)).toContainText(expected.term1.exam);
  await expect(tables.nth(0)).toContainText(expected.term1.row);
  await expect(tables.nth(0)).not.toContainText(expected.term2.exam);
  await expect(tables.nth(1)).toContainText(expected.term2.exam);
  await expect(tables.nth(1)).toContainText(expected.term2.row);
  await expect(tables.nth(1)).not.toContainText(expected.term1.exam);
  await expect(page.getByRole("heading", { name: "Term 1", exact: true })).toHaveCount(1);
  await expect(page.getByRole("heading", { name: "Term 2", exact: true })).toHaveCount(1);
  await expect(page.getByText(/Term 3|Mid-?Term/i)).toHaveCount(0);

  // Never any eligibility / promotion wording for a student or parent.
  await expect(page.locator("body")).not.toContainText(/eligib|promotion|pass mark/i);
  // Nobody else's marks.
  for (const other of expected.notThese) await expect(page.locator("body")).not.toContainText(other);
}

test("5. Admin creates Ayaan's Student Portal login (existing student, no duplicate)", async ({ page }) => {
  await loginAt(page, "/admin/login", SECONDARY_ADMIN.email, SECONDARY_ADMIN.password);
  await expect(page).toHaveURL(/\/dashboard/);
  await openStudentProfile(page, "Ayaan Warsame");

  await page.getByRole("button", { name: "Create Student Login" }).click();
  await expect(page.getByText(/Account created — share these with the student now/)).toBeVisible();
  await expect(page.getByText(`Login ID: ${SECONDARY_STUDENT_NUMBERS.Ayaan}`)).toBeVisible();
  const line = await page.getByText(/Temporary password:/).innerText();
  story.studentTemp = line.split("Temporary password:")[1].trim();
  expect(story.studentTemp.length).toBeGreaterThanOrEqual(12);

  // The profile now offers a reset (never a second create).
  await page.reload();
  await expect(page.getByText("Reset portal password")).toBeVisible();
  await expect(page.getByRole("button", { name: "Create Student Login" })).toHaveCount(0);
});

test("6. Student Portal: forced password change, then Term 1 / Term 2 / Annual results - nothing else, no eligibility", async ({ page }) => {
  await loginAt(page, "/student/login", SECONDARY_STUDENT_NUMBERS.Ayaan, story.studentTemp!);

  // The admin-issued temporary password must be changed before anything else is reachable.
  await expect(page.getByText(/temporary password\. Choose a new one to continue/i)).toBeVisible();
  story.studentPassword = "AyaanOwnPass-2027!";
  const fields = page.locator('input[type="password"]');
  await expect(fields).toHaveCount(3);
  await fields.nth(0).fill(story.studentTemp!);
  await fields.nth(1).fill(story.studentPassword);
  await fields.nth(2).fill(story.studentPassword);
  await page.getByRole("button", { name: "Set new password" }).click();
  await expect(page.getByText(/Welcome back, Ayaan/)).toBeVisible();

  await page.goto("/student/results");
  await expect(page.getByRole("heading", { name: "Annual result" })).toBeVisible();
  await expectTermResults(page, {
    term1: { exam: TERM1_EXAM, row: "45 / 50", result: "90.00%" },
    term2: { exam: TERM2_EXAM, row: "30 / 50", result: "60.00%" },
    annual: "75.00%", // (90 + 60) / 2, the year's own 50 / 50 weights
    notThese: ["38 / 50", "40 / 50", "Bilan", "Cali"],
  });
  await shot(page, "student-results");

  // Attendance: the same two-session table, scoped to the student's own year.
  await page.goto("/student/attendance");
  await expect(page.getByText(/No attendance records found for this academic year/)).toBeVisible();
  await shot(page, "student-attendance");
});

test("7. Parent Portal: each parent sees ONLY their own child, with the same Term 1 / Term 2 / Annual layout", async ({ page, request }) => {
  // --- Fadumo: mother of Ayaan ---
  await loginAt(page, "/parent/login", SECONDARY_PARENT.email, SECONDARY_PARENT.password);
  await page.goto("/parent/academics");
  await page.getByRole("button", { name: "Exams & Results" }).click();
  await expect(page.getByRole("heading", { name: "Annual result" })).toBeVisible();
  await expectTermResults(page, {
    term1: { exam: TERM1_EXAM, row: "45 / 50", result: "90.00%" },
    term2: { exam: TERM2_EXAM, row: "30 / 50", result: "60.00%" },
    annual: "75.00%",
    notThese: ["38 / 50", "40 / 50", "Bilan"],
  });
  await shot(page, "parent-results-fadumo");
  await signOut(page);

  // --- Hassan: father of Bilan (the OTHER child) ---
  await loginAt(page, "/parent/login", SECONDARY_OTHER_PARENT.email, SECONDARY_OTHER_PARENT.password);
  await page.goto("/parent/academics");
  await page.getByRole("button", { name: "Exams & Results" }).click();
  await expect(page.getByRole("heading", { name: "Annual result" })).toBeVisible();
  await expectTermResults(page, {
    term1: { exam: TERM1_EXAM, row: "38 / 50", result: "76.00%" },
    term2: { exam: TERM2_EXAM, row: "40 / 50", result: "80.00%" },
    annual: "78.00%",
    notThese: ["45 / 50", "30 / 50", "Ayaan"],
  });
  await shot(page, "parent-results-hassan");

  // --- direct API access: a parent cannot read another parent's child, results or attendance ---
  const hassanToken = await apiLogin(request, SECONDARY_OTHER_PARENT);
  const children = (await (await request.get(`${API}/guardians/me/children`, { headers: bearer(hassanToken) })).json()) as Array<{ studentId: string; firstName: string }>;
  expect(children.map((c) => c.firstName)).toEqual(["Bilan"]);
  const bilanId = children[0].studentId;

  const fadumoToken = await apiLogin(request, SECONDARY_PARENT);
  for (const path of ["results-report", "attendance", "academic-years", "exams"]) {
    const res = await request.get(`${API}/guardians/me/children/${bilanId}/${path}`, { headers: bearer(fadumoToken) });
    expect(res.status(), `Fadumo -> Bilan/${path}`).toBe(404);
  }
  // ...and her own child's report carries no eligibility field at all.
  const own = (await (await request.get(`${API}/guardians/me/children`, { headers: bearer(fadumoToken) })).json()) as Array<{ studentId: string }>;
  const report = await (await request.get(`${API}/guardians/me/children/${own[0].studentId}/results-report`, { headers: bearer(fadumoToken) })).json();
  expect(JSON.stringify(report)).not.toMatch(/eligib|passMark/i);
  expect(report.annual).toEqual({ term1Percentage: 90, term2Percentage: 60, annualPercentage: 75 });
});


// Results Review defaults to "waiting for review"; reach an already-published set via All statuses.
async function openFromReviewAnyStatus(page: Page, examName: string) {
  await page.getByRole("complementary").getByRole("link", { name: "Results Review" }).click();
  await page.locator("xpath=//label[normalize-space()='Status']/following::select[1]").selectOption({ label: "All statuses" });
  await page.getByRole("link", { name: examName }).click();
}

test("8. Unpublished results are invisible to the Student and the Parent; publishing brings them back", async ({ page }) => {
  // Admin takes Term 2 back out of publication (a reason is required).
  await loginAt(page, "/admin/login", SECONDARY_ADMIN.email, SECONDARY_ADMIN.password);
  await openFromReviewAnyStatus(page, TERM2_EXAM);
  await page.getByRole("button", { name: "Undo Publish" }).first().click();
  const undo = page.getByRole("alertdialog");
  await undo.getByRole("combobox").selectOption("Other");
  await undo.getByRole("textbox").fill("Re-checking Term 2 before release.");
  await undo.getByRole("button", { name: /Undo Publish/ }).click();
  await expect(contextValue(page, "Status")).not.toHaveText("Published");
  await signOut(page);

  // Student: Term 2 is gone (Incomplete), Term 1 untouched. Never a 0.
  await loginAt(page, "/student/login", SECONDARY_STUDENT_NUMBERS.Ayaan, story.studentPassword!);
  await page.goto("/student/results");
  await expect(page.getByText("No published results for Term 2 yet.")).toBeVisible();
  const summary = page.getByRole("heading", { name: "Annual result" }).locator("xpath=ancestor::div[contains(@class,'rounded')][1]");
  await expect(summary.getByText("90.00%", { exact: true })).toBeVisible();
  await expect(summary.getByText("Incomplete", { exact: true })).toHaveCount(2); // Term 2 Result + Annual / Combined
  await expect(page.locator("body")).not.toContainText(TERM2_EXAM);
  await expect(page.locator("body")).not.toContainText(/(^|[^0-9.])0\.00%/); // Incomplete is never shown as 0%
  await shot(page, "student-results-term2-unpublished");
  await signOut(page);

  // Parent: same rule.
  await loginAt(page, "/parent/login", SECONDARY_PARENT.email, SECONDARY_PARENT.password);
  await page.goto("/parent/academics");
  await page.getByRole("button", { name: "Exams & Results" }).click();
  await expect(page.getByText("No published results for Term 2 yet.")).toBeVisible();
  await expect(page.locator("body")).not.toContainText(TERM2_EXAM);
  await signOut(page);

  // Admin publishes it again.
  await loginAt(page, "/admin/login", SECONDARY_ADMIN.email, SECONDARY_ADMIN.password);
  await openFromReviewAnyStatus(page, TERM2_EXAM);
  // Undo Publish returns it to Approved: publish again.
  await page.getByRole("button", { name: "Publish Results" }).click();
  const dialog = page.getByRole("alertdialog");
  await dialog.getByRole("checkbox").check();
  await dialog.getByRole("button", { name: "Publish Results" }).click();
  await expect(page.getByText("Published — visible to students and parents.")).toBeVisible();
});

test("9. Admin resets an existing Student login and an existing Parent login - same accounts, forced password change", async ({ page, request }) => {
  await loginAt(page, "/admin/login", SECONDARY_ADMIN.email, SECONDARY_ADMIN.password);
  const adminToken = await apiLogin(request, SECONDARY_ADMIN);

  // How many students exist before/after: a reset must not change the number.
  let schoolId = "";
  const students = async () => ((await (await request.get(`${API}/schools/${schoolId}/students`, { headers: bearer(adminToken) })).json()) as { items?: unknown[] } | unknown[]);
  const countOf = (body: unknown) => (Array.isArray(body) ? body.length : ((body as { items?: unknown[]; total?: number }).total ?? (body as { items?: unknown[] }).items?.length ?? -1));

  // ---------------- Student ----------------
  await openStudentProfile(page, "Ayaan Warsame");
  schoolId = new URL(page.url()).pathname.split("/")[2];
  const studentsBefore = countOf(await students());
  expect(studentsBefore).toBe(3); // Ayaan, Bilan, Cali - and no more after the reset
  await page.getByRole("button", { name: "Reset password" }).click();
  await page.getByRole("button", { name: "Reset password" }).last().click();
  await expect(page.getByText(/Password reset — share these with Ayaan Warsame now/)).toBeVisible();
  await expect(page.getByText(`Login ID: ${SECONDARY_STUDENT_NUMBERS.Ayaan}`)).toBeVisible(); // same permanent Student ID
  const line = await page.getByText(/Temporary password:/).innerText();
  const studentTemp = line.split("Temporary password:")[1].trim();
  expect(countOf(await students())).toBe(studentsBefore);
  await signOut(page);

  // The old password is dead; the temporary one works but must be changed.
  await loginAt(page, "/student/login", SECONDARY_STUDENT_NUMBERS.Ayaan, story.studentPassword!);
  await expect(page.getByText(/invalid (email|login id|credentials)|incorrect|invalid/i).first()).toBeVisible();
  await loginAt(page, "/student/login", SECONDARY_STUDENT_NUMBERS.Ayaan, studentTemp);
  await expect(page.getByText(/temporary password\. Choose a new one to continue/i)).toBeVisible();
  const sFields = page.locator('input[type="password"]');
  await sFields.nth(0).fill(studentTemp);
  await sFields.nth(1).fill(story.studentPassword!);
  await sFields.nth(2).fill(story.studentPassword!);
  await page.getByRole("button", { name: "Set new password" }).click();
  await expect(page.getByText(/Welcome back, Ayaan/)).toBeVisible();
  // Same student, same results after the reset (identity preserved).
  await page.goto("/student/results");
  await expect(page.getByRole("table").first()).toContainText(TERM1_EXAM);
  await signOut(page);

  // ---------------- Parent ----------------
  await loginAt(page, "/admin/login", SECONDARY_ADMIN.email, SECONDARY_ADMIN.password);
  await page.getByRole("complementary").getByRole("link", { name: "Parents" }).click();
  await expect(page.getByRole("row", { name: /Fadumo Warsame/ })).toHaveCount(1);
  await page.getByRole("row", { name: /Fadumo Warsame/ }).getByRole("button", { name: "View" }).click();
  await expect(page.getByText("Reset portal password")).toBeVisible();
  await expect(page.getByRole("button", { name: "Create Portal Account" })).toHaveCount(0);
  await page.getByRole("button", { name: "Reset password" }).click();
  await page.getByRole("button", { name: "Reset password" }).last().click();
  await expect(page.getByText(/Password reset — share these with Fadumo Warsame now/)).toBeVisible();
  const pLine = await page.getByText(/Temporary password:/).innerText();
  const parentTemp = pLine.split("Temporary password:")[1].trim();
  await page.getByRole("complementary").getByRole("link", { name: "Parents" }).click();
  await expect(page.getByRole("row", { name: /Fadumo Warsame/ })).toHaveCount(1); // still one Fadumo
  await signOut(page);

  await loginAt(page, "/parent/login", SECONDARY_PARENT.email, SECONDARY_PARENT.password);
  await expect(page.getByText(/invalid email or password/i)).toBeVisible();
  await loginAt(page, "/parent/login", SECONDARY_PARENT.email, parentTemp);
  await expect(page.getByText(/temporary password\. Choose a new one to continue/i)).toBeVisible();
  const pFields = page.locator('input[type="password"]');
  await pFields.nth(0).fill(parentTemp);
  await pFields.nth(1).fill(SECONDARY_PARENT.password);
  await pFields.nth(2).fill(SECONDARY_PARENT.password);
  await page.getByRole("button", { name: "Set new password" }).click();
  // Still linked to the same child (relationship preserved).
  await expect(page.getByText("Ayaan Warsame", { exact: true }).first()).toBeVisible();
});

test("10. Parent/guardian rules: search first, one Mother and one Father per student, unlimited other relatives, no duplicate parents", async ({ page, request }) => {
  await loginAt(page, "/admin/login", SECONDARY_ADMIN.email, SECONDARY_ADMIN.password);
  const token = await apiLogin(request, SECONDARY_ADMIN);

  // --- Ayaan already has a Mother (Fadumo). Search first, and link the EXISTING parent Hassan as an Other relative. ---
  await openStudentProfile(page, "Ayaan Warsame");
  const ayaanUrl = page.url();
  const [, , schoolId, , ayaanId] = new URL(ayaanUrl).pathname.split("/");
  await page.getByRole("button", { name: "Add guardian" }).click();
  await page.getByPlaceholder(/Search parent by name, phone, or email/).fill("Hassan");
  await expect(page.getByText("Hassan Noor")).toBeVisible();
  await expect(page.getByText("Already linked to 1 student")).toBeVisible(); // found, not re-created
  await page.getByRole("button", { name: "Select Parent" }).click();

  const relationship = page.getByLabel("Relationship");
  await expect(page.getByRole("option", { name: "Mother — already assigned to Fadumo Warsame" })).toBeDisabled();
  await expect(relationship).toHaveValue("FATHER"); // the default skips the taken Mother
  await relationship.selectOption("OTHER");
  await page.getByRole("button", { name: "Save / Link Parent" }).click();
  await expect(page.getByText("Guardian added.")).toBeVisible();
  await expect(page.getByText("Other relative").first()).toBeVisible();
  await shot(page, "guardian-relationship-labels");

  // --- the SAME existing parent (Fadumo) linked to a second child (Bilan) as a Guardian ---
  await page.getByRole("complementary").getByRole("link", { name: "Students" }).click();
  await page.getByText("Bilan Noor", { exact: false }).first().click();
  await page.getByRole("button", { name: "Add guardian" }).click();
  await page.getByPlaceholder(/Search parent by name, phone, or email/).fill("Fadumo");
  await expect(page.getByText("Already linked to 2 students").or(page.getByText("Already linked to 1 student"))).toBeVisible();
  await page.getByRole("button", { name: "Select Parent" }).click();
  // Bilan's Father slot is taken (Hassan), her Mother slot is free.
  await expect(page.getByRole("option", { name: "Father — already assigned to Hassan Noor" })).toBeDisabled();
  await expect(page.getByRole("option", { name: "Mother", exact: true })).toBeEnabled();
  await page.getByLabel("Relationship").selectOption("GUARDIAN");
  await page.getByRole("button", { name: "Save / Link Parent" }).click();
  await expect(page.getByText("Guardian added.")).toBeVisible();

  // Still exactly one Fadumo and one Hassan on the Parents page: no duplicate parent identity.
  await page.getByRole("complementary").getByRole("link", { name: "Parents" }).click();
  await expect(page.getByRole("row", { name: /Fadumo Warsame/ })).toHaveCount(1);
  await expect(page.getByRole("row", { name: /Hassan Noor/ })).toHaveCount(1);

  // Creating "a new parent" who already exists (same phone) reuses the record instead of duplicating it.
  const bilanId = (await (await request.get(`${API}/schools/${schoolId}/students`, { headers: bearer(token) })).json() as Array<{ studentId: string; firstName: string }>).find((x) => x.firstName === "Bilan")!.studentId;
  const farahForAyaan = await request.post(`${API}/students/${ayaanId}/guardians`, { headers: bearer(token), data: { firstName: "Farah", lastName: "Jama", phone: "0644444444", relationship: "OTHER" } });
  const farahForBilan = await request.post(`${API}/students/${bilanId}/guardians`, { headers: bearer(token), data: { firstName: "F.", lastName: "Jama", phone: "0644444444", relationship: "OTHER" } });
  expect(farahForAyaan.ok(), `Farah -> Ayaan: ${farahForAyaan.status()} ${await farahForAyaan.text()}`).toBeTruthy();
  expect(farahForBilan.ok(), `Farah -> Bilan (${bilanId}): ${farahForBilan.status()} ${await farahForBilan.text()}`).toBeTruthy();
  expect((await farahForAyaan.json()).id).toBe((await farahForBilan.json()).id); // one parent, two children
  const farahSearch = (await (await request.get(`${API}/schools/${schoolId}/guardians?search=Jama`, { headers: bearer(token) })).json()) as Array<{ id: string; linkedStudentCount: number }>;
  expect(farahSearch).toHaveLength(1);
  expect(farahSearch[0].linkedStudentCount).toBe(2);

  // --- a new Father for Ayaan is fine; a second Mother / second Father is refused by the SERVER ---
  const addGuardian = (studentId: string, body: object) => request.post(`${API}/students/${studentId}/guardians`, { headers: bearer(token), data: body });
  const father = await addGuardian(ayaanId, { firstName: "Ali", lastName: "Warsame", phone: "0655555555", relationship: "FATHER" });
  expect(father.ok()).toBeTruthy();

  const secondMother = await addGuardian(ayaanId, { firstName: "Second", lastName: "Mother", phone: "0666666661", relationship: "MOTHER" });
  expect(secondMother.status()).toBe(409);
  expect((await secondMother.json()).message).toContain("This student already has a Mother (Fadumo Warsame). A student can have only one Mother");

  const secondFather = await addGuardian(ayaanId, { firstName: "Second", lastName: "Father", phone: "0666666662", relationship: "FATHER" });
  expect(secondFather.status()).toBe(409);
  expect((await secondFather.json()).message).toContain("This student already has a Father (Ali Warsame). A student can have only one Father");

  // Other relatives are unlimited (uncle, aunt, step-parent... as Guardian / Other relative).
  for (const [i, rel] of (["OTHER", "OTHER", "GUARDIAN"] as const).entries()) {
    const res = await addGuardian(ayaanId, { firstName: `Relative${i}`, lastName: "Warsame", phone: `06777777${i}0`, relationship: rel });
    expect(res.ok(), `relative ${i} as ${rel}`).toBeTruthy();
  }
  // Rejected people were never created.
  const search = await (await request.get(`${API}/schools/${schoolId}/guardians?search=Second`, { headers: bearer(token) })).json();
  expect(JSON.stringify(search)).not.toMatch(/Second/);

  // The profile shows every relationship with its clear label.
  await page.goto(ayaanUrl);
  await expect(page.getByText("Mother", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Father", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Other relative").first()).toBeVisible();
  await expect(page.getByText("Guardian", { exact: true }).first()).toBeVisible();
  await shot(page, "student-guardians-all-relationships");

  // ...and the UI itself now refuses to offer a second Mother or Father.
  await page.getByRole("button", { name: "Add guardian" }).click();
  await page.getByRole("button", { name: "Create a new parent instead" }).click();
  await expect(page.getByRole("option", { name: /Mother — already assigned to Fadumo Warsame/ })).toBeDisabled();
  await expect(page.getByRole("option", { name: /Father — already assigned to Ali Warsame/ })).toBeDisabled();
});

test("11. Teacher subject assignment: only unassigned existing subjects are offered, duplicates are refused, no Subject is created", async ({ page, request }) => {
  await loginAt(page, "/admin/login", SECONDARY_ADMIN.email, SECONDARY_ADMIN.password);
  const token = await apiLogin(request, SECONDARY_ADMIN);

  // The school's subject master before: exactly Mathematics, Physics, Chemistry.
  await page.getByRole("complementary").getByRole("link", { name: "Academic" }).click();
  await page.getByRole("button", { name: "Subjects" }).click();
  for (const subject of ["Mathematics", "Physics", "Chemistry"]) await expect(page.getByText(subject, { exact: true }).first()).toBeVisible();

  await page.getByRole("complementary").getByRole("link", { name: "Teachers" }).click();
  await page.getByText("Abdi Mohamud", { exact: false }).first().click();
  await expect(page).toHaveURL(/\/teachers\/[0-9a-f-]{36}/);
  const [, , schoolId, , teacherId] = new URL(page.url()).pathname.split("/");

  await page.getByRole("button", { name: "Edit", exact: true }).click();
  const form = page.getByText("Add assignment").locator("xpath=..");
  await form.locator("select").nth(0).selectOption({ label: "2027" });
  await form.locator("select").nth(1).selectOption({ label: "Form 1" });
  await form.locator("select").nth(2).selectOption({ label: "A" });

  // Mathematics is already assigned in Form 1 A: it is NOT offered again; the other two are.
  await expect(form.getByRole("checkbox", { name: "Physics" })).toBeVisible();
  await expect(form.getByRole("checkbox", { name: "Chemistry" })).toBeVisible();
  await expect(form.getByRole("checkbox", { name: "Mathematics" })).toHaveCount(0);

  await form.getByRole("checkbox", { name: "Physics" }).check();
  await page.getByRole("button", { name: "Add 1 subject" }).click();
  await expect(page.getByText("1 subject assignment added.")).toBeVisible();

  // Now Physics is taken too: only Chemistry remains.
  await expect(form.getByRole("checkbox", { name: "Physics" })).toHaveCount(0);
  await expect(form.getByRole("checkbox", { name: "Chemistry" })).toBeVisible();
  await shot(page, "teacher-assignment-remaining-subjects");

  // The server refuses a duplicate even if the UI were bypassed.
  const teacherRes = await request.get(`${API}/schools/${schoolId}/teachers/${teacherId}`, { headers: bearer(token) });
  expect(teacherRes.ok(), `GET teacher ${teacherId} (${page.url()}): ${await teacherRes.text()}`).toBeTruthy();
  const teacher = await teacherRes.json();
  const math = teacher.assignments.find((a: { subject: { name: string } }) => a.subject.name === "Mathematics");
  const duplicate = await request.post(`${API}/schools/${schoolId}/teachers/${teacherId}/assignments`, {
    headers: bearer(token),
    data: { academicYearId: math.academicYearId, sectionId: math.sectionId, subjectId: math.subjectId },
  });
  expect(duplicate.status()).toBe(409);
  expect((await duplicate.json()).message).toMatch(/already assigned/);

  // No Subject was created by any of this: still exactly the three.
  await page.getByRole("complementary").getByRole("link", { name: "Academic" }).click();
  await page.getByRole("button", { name: "Subjects" }).click();
  for (const subject of ["Mathematics", "Physics", "Chemistry"]) await expect(page.getByText(subject, { exact: true })).toHaveCount(1);
  await expect(page.getByText(/Physics \(2\)|Physics 2/)).toHaveCount(0);
});
