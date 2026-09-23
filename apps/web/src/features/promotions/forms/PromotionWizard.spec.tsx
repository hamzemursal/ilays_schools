import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { AcademicYear, ClassWithSections, PromotionPreview } from "@/lib/api";
import { ToastProvider } from "@/components/ui/Toast";
import { PromotionWizard } from "./PromotionWizard";

const { ApiError } = vi.hoisted(() => {
  class ApiError extends Error {
    status: number;
    constructor(message: string, status = 400) {
      super(message);
      this.status = status;
    }
  }
  return { ApiError };
});
const authMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth-context", () => ({ useAuth: () => authMock(), ApiError }));

const apiMock = vi.hoisted(() => ({
  listAcademicYears: vi.fn(),
  listClasses: vi.fn(),
  previewPromotion: vi.fn(),
  confirmPromotion: vi.fn(),
}));
vi.mock("@/lib/api", () => ({ api: apiMock }));

const YEARS: AcademicYear[] = [
  { id: "year-1", name: "2027", startDate: "2027-01-01", endDate: "2027-12-31", isCurrent: true, terms: [] },
  { id: "year-2", name: "2028", startDate: "2028-01-01", endDate: "2028-12-31", isCurrent: false, terms: [] },
];
const CLASSES: ClassWithSections[] = [
  {
    id: "class-1",
    name: "Class 1",
    level: 1,
    division: { id: "div-1", type: "PRIMARY" },
    sections: [{ id: "section-a", name: "A", capacity: 30, _count: { enrollments: 2 } }],
    _count: { classSubjects: 4 },
  },
];

function eligibleStudent(overrides: Partial<PromotionPreview["students"][number]> = {}): PromotionPreview["students"][number] {
  return {
    studentId: "student-1",
    enrollmentId: "enr-1",
    firstName: "Ahmed",
    lastName: "Ali",
    rollNumber: 1,
    studentNumber: "STU-1",
    term1Percentage: 60,
    term2Percentage: 70,
    annualPercentage: 65,
    eligible: true,
    suggestedOutcome: "PROMOTED",
    ...overrides,
  };
}

function basePreview(overrides: Partial<PromotionPreview> = {}): PromotionPreview {
  return {
    naturalOutcome: "PROMOTED",
    currentClass: { id: "class-1", name: "Class 1" },
    nextClass: { id: "class-2", name: "Class 2" },
    targetAcademicYear: { id: "year-2", name: "2028" },
    currentClassSections: [{ id: "cur-a", name: "A", capacity: 30, currentActive: 2, available: 28 }],
    nextClassSections: [{ id: "next-a", name: "A", capacity: 30, currentActive: 0, available: 30 }],
    warnings: [],
    students: [eligibleStudent()],
    ...overrides,
  };
}

function renderWizard() {
  return render(
    <ToastProvider>
      <PromotionWizard schoolId="school-1" />
    </ToastProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  authMock.mockReturnValue({ accessToken: "token" });
  apiMock.listAcademicYears.mockResolvedValue(YEARS);
  apiMock.listClasses.mockResolvedValue(CLASSES);
});

// Selects the destination year (Step 1 requires it before Preview is even
// enabled — a real behavior change from before: the chosen year is now
// actually sent to the preview call, not silently ignored) then clicks Preview.
async function preview(user: ReturnType<typeof userEvent.setup>, yearName = "2028") {
  await waitFor(() => expect(screen.getByLabelText("To academic year", { exact: false })).toBeInTheDocument());
  await user.selectOptions(screen.getByLabelText("To academic year", { exact: false }), yearName);
  await waitFor(() => expect(screen.getByRole("button", { name: "Preview" })).toBeEnabled());
  await user.click(screen.getByRole("button", { name: "Preview" }));
  await waitFor(() => expect(apiMock.previewPromotion).toHaveBeenCalled());
}

describe("PromotionWizard — source/destination display (Step 1)", () => {
  it("shows the From card's real source selectors and disables Preview until a destination year is chosen", async () => {
    apiMock.previewPromotion.mockResolvedValue(basePreview());
    renderWizard();

    await waitFor(() => expect(screen.getByLabelText("From academic year", { exact: false })).toHaveValue("year-1"));
    expect(screen.getByText("From (Current Year)")).toBeInTheDocument();
    expect(screen.getByText("To (Destination Year)")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Preview" })).toBeDisabled();
  });

  it("passes the chosen destination year into the real preview API call — never silently defaulted", async () => {
    apiMock.previewPromotion.mockResolvedValue(basePreview());
    const user = userEvent.setup();
    renderWizard();

    await preview(user);

    expect(apiMock.previewPromotion).toHaveBeenCalledWith("token", "school-1", "section-a", "year-1", "year-2");
  });

  it("after Preview, shows the real destination class and section computed by the API — never fabricated", async () => {
    apiMock.previewPromotion.mockResolvedValue(basePreview());
    const user = userEvent.setup();
    renderWizard();

    await preview(user);

    expect(await screen.findByText("Class 2")).toBeInTheDocument(); // destination class, from preview.nextClass
  });

  it("only offers academic years that start AFTER the year being promoted from — never the same or an earlier one", async () => {
    const EARLIER: AcademicYear = { id: "year-0", name: "2024-2025", startDate: "2024-01-01", endDate: "2024-12-31", isCurrent: false, terms: [] };
    apiMock.listAcademicYears.mockResolvedValue([EARLIER, ...YEARS]);
    renderWizard();

    await waitFor(() => expect(screen.getByLabelText("To academic year", { exact: false })).toBeInTheDocument());
    const toYear = screen.getByLabelText("To academic year", { exact: false }) as HTMLSelectElement;
    expect(Array.from(toYear.options).map((o) => o.textContent)).toEqual(["Select…", "2028"]);
  });

  it("with no later academic year, tells the Admin to create it first, right in Step 1", async () => {
    apiMock.listAcademicYears.mockResolvedValue([YEARS[0]]); // only the current year exists
    renderWizard();

    await waitFor(() => expect(screen.getByText(/no academic year after 2027 yet/i)).toBeInTheDocument());
    expect(screen.getByText(/Promotion never creates an academic year for you/)).toBeInTheDocument();
  });
});

describe("PromotionWizard — destination-not-ready state", () => {
  it("shows an actionable 'Destination not ready' card, using the API's own real message, when the next class doesn't exist yet", async () => {
    apiMock.previewPromotion.mockRejectedValue(
      new ApiError("Class 1 can't be promoted yet - Class 2 has not been created for 2028. Create Class 2 (with its sections) in that academic year first.", 400),
    );
    const user = userEvent.setup();
    renderWizard();

    await preview(user);

    expect(await screen.findByText("Destination not ready")).toBeInTheDocument();
    expect(screen.getByText(/Class 2 has not been created for 2028/)).toBeInTheDocument();
    // Links straight to the destination year's own page — the year-scoped
    // hierarchy (Academic Years -> year -> Primary/Secondary -> Class/Form)
    // is where that class now gets created, not the old flat tab.
    expect(screen.getByRole("link", { name: /Go to 2028/ })).toHaveAttribute(
      "href",
      "/schools/school-1/academic/years/year-2",
    );
    // Never a generic, unhelpful error banner for this specific case.
    expect(screen.queryByText(/Failed to preview promotion/)).not.toBeInTheDocument();
  });

  it("shows a graceful warning (not a hard failure) when only the retained class is missing", async () => {
    apiMock.previewPromotion.mockResolvedValue(
      basePreview({ retainedClass: null, currentClassSections: [], warnings: ["Class 1 has not been created for 2028, so students cannot be retained until it is."] }),
    );
    const user = userEvent.setup();
    renderWizard();

    await preview(user);

    expect(await screen.findByText(/cannot be retained until it is/)).toBeInTheDocument();
    // The preview itself still renders — this is a warning, not a blocking error.
    expect(screen.getByText("Preview Students")).toBeInTheDocument();
  });
});

describe("PromotionWizard — per-student review table (Step 2)", () => {
  it("shows Term 1, Term 2, Annual Result and an Eligible badge for a student with real results", async () => {
    apiMock.previewPromotion.mockResolvedValue(basePreview());
    const user = userEvent.setup();
    renderWizard();

    await preview(user);

    expect(screen.getByText("60.00%")).toBeInTheDocument();
    expect(screen.getByText("70.00%")).toBeInTheDocument();
    expect(screen.getByText("65.00%")).toBeInTheDocument();
    expect(screen.getByText("Eligible")).toBeInTheDocument();
  });

  it("an eligible student defaults to Promote with an automatically computed next-class destination — no manual pick required", async () => {
    apiMock.previewPromotion.mockResolvedValue(basePreview());
    const user = userEvent.setup();
    renderWizard();

    await preview(user);

    expect(screen.getByLabelText("Decision for Ahmed Ali")).toHaveValue("PROMOTED");
    // No destination select shown at all for a normal decision — it's a
    // read-only, system-computed badge instead of an editable dropdown.
    expect(screen.queryByLabelText("Destination section for Ahmed Ali")).not.toBeInTheDocument();
    const row = screen.getByRole("row", { name: /Ahmed Ali/ });
    expect(within(row).getByText("Class 2 · A")).toBeInTheDocument();
  });

  it("an ineligible student shows Not Eligible and defaults to Retain, targeting the same class in the destination year", async () => {
    apiMock.previewPromotion.mockResolvedValue(
      basePreview({
        students: [
          eligibleStudent({
            term1Percentage: 45,
            term2Percentage: 40,
            annualPercentage: 42.5,
            eligible: false,
            suggestedOutcome: "RETAINED",
          }),
        ],
      }),
    );
    const user = userEvent.setup();
    renderWizard();

    await preview(user);

    expect(screen.getByText("Not Eligible")).toBeInTheDocument();
    expect(screen.getByLabelText("Decision for Ahmed Ali")).toHaveValue("RETAINED");
    const row = screen.getByRole("row", { name: /Ahmed Ali/ });
    expect(within(row).getByText("Class 1 · A")).toBeInTheDocument();
  });

  it("shows an Incomplete badge, dashes for every percentage, and no default decision — never a fabricated 0%", async () => {
    apiMock.previewPromotion.mockResolvedValue(
      basePreview({
        students: [eligibleStudent({ term1Percentage: null, term2Percentage: null, annualPercentage: null, eligible: null, suggestedOutcome: null })],
      }),
    );
    const user = userEvent.setup();
    renderWizard();

    await preview(user);

    expect(screen.getByText("Incomplete")).toBeInTheDocument();
    expect(screen.getAllByText("—").length).toBeGreaterThanOrEqual(3);
    expect(screen.getByLabelText("Decision for Ahmed Ali")).toHaveValue("");
  });

  it("a student below 50% cannot be given the Promote decision — only Retain or Manual Review", async () => {
    apiMock.previewPromotion.mockResolvedValue(
      basePreview({
        students: [eligibleStudent({ term1Percentage: 45, term2Percentage: 41, annualPercentage: 43, eligible: false, suggestedOutcome: "RETAINED" })],
      }),
    );
    const user = userEvent.setup();
    renderWizard();
    await preview(user);

    const decision = screen.getByLabelText("Decision for Ahmed Ali") as HTMLSelectElement;
    const optionFor = (value: string) => Array.from(decision.options).find((o) => o.value === value)!;
    expect(optionFor("PROMOTED").disabled).toBe(true);
    expect(optionFor("RETAINED").disabled).toBe(false);
    expect(decision.value).toBe("RETAINED");
  });

  it("an eligible student (exactly 50.00%) can still be promoted", async () => {
    apiMock.previewPromotion.mockResolvedValue(
      basePreview({ students: [eligibleStudent({ annualPercentage: 50, term1Percentage: 50, term2Percentage: 50, eligible: true })] }),
    );
    const user = userEvent.setup();
    renderWizard();
    await preview(user);

    const decision = screen.getByLabelText("Decision for Ahmed Ali") as HTMLSelectElement;
    expect(Array.from(decision.options).find((o) => o.value === "PROMOTED")!.disabled).toBe(false);
  });
});

describe("PromotionWizard — Manual Review", () => {
  it("for an Incomplete student manually given a decision first, Manual Review seeds from THAT decision — never falling back to the (null) system suggestion", async () => {
    apiMock.previewPromotion.mockResolvedValue(
      basePreview({ students: [eligibleStudent({ eligible: null, suggestedOutcome: null, annualPercentage: null })] }),
    );
    const user = userEvent.setup();
    renderWizard();
    await preview(user);
    await user.selectOptions(screen.getByLabelText("Decision for Ahmed Ali"), "PROMOTED");

    await user.selectOptions(screen.getByLabelText("Decision for Ahmed Ali"), "MANUAL_REVIEW");

    expect(screen.getByLabelText("Manual outcome for Ahmed Ali")).toHaveValue("PROMOTED");
    expect(screen.getByLabelText("Destination section for Ahmed Ali")).toHaveValue("next-a");
  });

  it("choosing Manual Review reveals a per-student outcome + destination picker, seeded from the current decision", async () => {
    apiMock.previewPromotion.mockResolvedValue(basePreview());
    const user = userEvent.setup();
    renderWizard();
    await preview(user);

    await user.selectOptions(screen.getByLabelText("Decision for Ahmed Ali"), "MANUAL_REVIEW");

    expect(screen.getByLabelText("Manual outcome for Ahmed Ali")).toHaveValue("PROMOTED");
    expect(screen.getByLabelText("Destination section for Ahmed Ali")).toHaveValue("next-a");
  });

  it("switching the manual outcome from Promote to Retain clears the destination, forcing a fresh pick from the right pool", async () => {
    apiMock.previewPromotion.mockResolvedValue(basePreview());
    const user = userEvent.setup();
    renderWizard();
    await preview(user);
    await user.selectOptions(screen.getByLabelText("Decision for Ahmed Ali"), "MANUAL_REVIEW");

    await user.selectOptions(screen.getByLabelText("Manual outcome for Ahmed Ali"), "RETAINED");

    const destination = screen.getByLabelText("Destination section for Ahmed Ali") as HTMLSelectElement;
    expect(destination.value).toBe("");
    await user.selectOptions(destination, "cur-a");
    expect(destination).toHaveValue("cur-a");
  });

  it("going back from Manual Review to a normal decision restores the automatic destination and hides the manual controls", async () => {
    apiMock.previewPromotion.mockResolvedValue(basePreview());
    const user = userEvent.setup();
    renderWizard();
    await preview(user);
    await user.selectOptions(screen.getByLabelText("Decision for Ahmed Ali"), "MANUAL_REVIEW");

    await user.selectOptions(screen.getByLabelText("Decision for Ahmed Ali"), "PROMOTED");

    expect(screen.queryByLabelText("Manual outcome for Ahmed Ali")).not.toBeInTheDocument();
    const row = screen.getByRole("row", { name: /Ahmed Ali/ });
    expect(within(row).getByText("Class 2 · A")).toBeInTheDocument();
  });

  it("counts a student left in Manual Review toward the Promotion Summary's Manual Review tile", async () => {
    apiMock.previewPromotion.mockResolvedValue(basePreview());
    const user = userEvent.setup();
    renderWizard();
    await preview(user);

    await user.selectOptions(screen.getByLabelText("Decision for Ahmed Ali"), "MANUAL_REVIEW");

    // "Manual Review" also appears as a <select> option in the table, so
    // scope to the StatCard's own label paragraph specifically.
    const tile = screen.getByText("Manual Review", { selector: "p" }).closest("div")!.parentElement!;
    expect(within(tile).getByText("1")).toBeInTheDocument();
  });
});

describe("PromotionWizard — confirmation summary and submit", () => {
  it("Confirm Promotion is disabled until every student has a full decision (Incomplete students block it)", async () => {
    apiMock.previewPromotion.mockResolvedValue(
      basePreview({ students: [eligibleStudent({ eligible: null, suggestedOutcome: null, annualPercentage: null })] }),
    );
    const user = userEvent.setup();
    renderWizard();
    await preview(user);

    expect(screen.getByRole("button", { name: "Confirm Promotion" })).toBeDisabled();

    await user.selectOptions(screen.getByLabelText("Decision for Ahmed Ali"), "RETAINED");
    expect(screen.getByRole("button", { name: "Confirm Promotion" })).toBeEnabled();
  });

  it("shows real, non-hardcoded counts in the summary tiles and the 'what will happen' panel", async () => {
    apiMock.previewPromotion.mockResolvedValue(
      basePreview({
        students: [
          eligibleStudent({ enrollmentId: "enr-1", firstName: "Ahmed" }),
          eligibleStudent({
            enrollmentId: "enr-2",
            firstName: "Hodan",
            eligible: false,
            suggestedOutcome: "RETAINED",
            annualPercentage: 40,
          }),
        ],
      }),
    );
    const user = userEvent.setup();
    renderWizard();
    await preview(user);

    const totalTile = screen.getByText("Total Students", { selector: "p" }).closest("div")!.parentElement!;
    expect(within(totalTile).getByText("2")).toBeInTheDocument();
    // The sentence is split across inline nodes (a <span> wraps the class
    // name) — match on each bullet's own full text content instead of a
    // single text node.
    expect(
      screen.getByText((_, el) => el?.tagName === "LI" && /1 student will receive new enrollments in/.test(el.textContent ?? "") && /Class 2/.test(el.textContent ?? "")),
    ).toBeInTheDocument();
    expect(
      screen.getByText((_, el) => el?.tagName === "LI" && /1 student will receive new enrollments in/.test(el.textContent ?? "") && /Class 1/.test(el.textContent ?? "")),
    ).toBeInTheDocument();
  });

  it("opens a confirmation dialog with the required explanatory text before submitting", async () => {
    apiMock.previewPromotion.mockResolvedValue(basePreview());
    const user = userEvent.setup();
    renderWizard();
    await preview(user);

    await user.click(screen.getByRole("button", { name: "Confirm Promotion" }));

    const dialog = screen.getByRole("alertdialog");
    expect(within(dialog).getByRole("heading", { name: "Confirm Promotion" })).toBeInTheDocument();
    expect(within(dialog).getByText(/Existing historical records will remain unchanged/)).toBeInTheDocument();
  });

  it("submits assignments built from the reviewed table, using the real confirm API, only after the dialog is confirmed", async () => {
    apiMock.previewPromotion.mockResolvedValue(basePreview());
    apiMock.confirmPromotion.mockResolvedValue({ id: "batch-1", items: [{ id: "item-1", studentId: "student-1", outcome: "PROMOTED" }] });
    const user = userEvent.setup();
    renderWizard();
    await preview(user);

    await user.click(screen.getByRole("button", { name: "Confirm Promotion" }));
    expect(apiMock.confirmPromotion).not.toHaveBeenCalled();
    const dialog = screen.getByRole("alertdialog");
    await user.click(within(dialog).getByRole("button", { name: "Confirm Promotion" }));

    await waitFor(() =>
      expect(apiMock.confirmPromotion).toHaveBeenCalledWith("token", "school-1", "section-a", {
        fromAcademicYearId: "year-1",
        toAcademicYearId: "year-2",
        assignments: [{ enrollmentId: "enr-1", outcome: "PROMOTED", targetSectionId: "next-a" }],
      }),
    );
    expect(await screen.findByText(/Promotion confirmed/)).toBeInTheDocument();
  });

  it("shows the API's message when the school structure is incomplete, instead of a fabricated Graduate outcome", async () => {
    apiMock.previewPromotion.mockRejectedValue(new ApiError("Something else went wrong entirely.", 400));
    const user = userEvent.setup();
    renderWizard();
    await preview(user);

    expect(await screen.findByText("Something else went wrong entirely.")).toBeInTheDocument();
    expect(screen.queryByText(/Graduate/)).not.toBeInTheDocument();
  });
});

describe("PromotionWizard — academic-year isolation", () => {
  it("changing the source class/section/year resets any existing preview, never mixing two years' students", async () => {
    apiMock.previewPromotion.mockResolvedValue(basePreview());
    const user = userEvent.setup();
    renderWizard();
    await preview(user);
    expect(screen.getByText("Preview Students")).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText("From academic year", { exact: false }), "year-2");

    expect(screen.queryByText("Preview Students")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Preview" })).toBeDisabled();
  });

  it("never sends a destination year that is the same as or earlier than the source year (structural guard stays in the request)", async () => {
    apiMock.previewPromotion.mockResolvedValue(basePreview());
    const user = userEvent.setup();
    renderWizard();
    await preview(user);

    expect(apiMock.previewPromotion).toHaveBeenCalledWith("token", "school-1", "section-a", "year-1", "year-2");
    expect(apiMock.previewPromotion).not.toHaveBeenCalledWith("token", "school-1", "section-a", "year-1", "year-1");
  });
});
