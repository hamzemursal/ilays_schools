import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
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
    currentClassSections: [{ id: "cur-a", name: "A", capacity: 30, currentActive: 2, available: 28 }],
    nextClassSections: [{ id: "next-a", name: "A", capacity: 30, currentActive: 0, available: 30 }],
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

async function preview(user: ReturnType<typeof userEvent.setup>) {
  await waitFor(() => expect(screen.getByRole("button", { name: "Preview" })).toBeEnabled());
  await user.click(screen.getByRole("button", { name: "Preview" }));
  await waitFor(() => expect(apiMock.previewPromotion).toHaveBeenCalled());
}

describe("PromotionWizard — per-student review table", () => {
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

  it("pre-selects Promote for an eligible student and defaults to a valid next-class destination", async () => {
    apiMock.previewPromotion.mockResolvedValue(basePreview());
    const user = userEvent.setup();
    renderWizard();

    await preview(user);

    expect(screen.getByLabelText("Outcome for Ahmed Ali")).toHaveValue("PROMOTED");
    expect(screen.getByLabelText("Destination section for Ahmed Ali")).toHaveValue("next-a");
  });

  it("shows Not Eligible and pre-selects Retain for an ineligible student, targeting the current class", async () => {
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
    expect(screen.getByLabelText("Outcome for Ahmed Ali")).toHaveValue("RETAINED");
    expect(screen.getByLabelText("Destination section for Ahmed Ali")).toHaveValue("cur-a");
  });

  it("shows an Incomplete badge, dashes for every percentage, and no suggested outcome — never a fabricated 0%", async () => {
    apiMock.previewPromotion.mockResolvedValue(
      basePreview({
        students: [
          eligibleStudent({
            term1Percentage: null,
            term2Percentage: null,
            annualPercentage: null,
            eligible: null,
            suggestedOutcome: null,
          }),
        ],
      }),
    );
    const user = userEvent.setup();
    renderWizard();

    await preview(user);

    expect(screen.getByText("Incomplete")).toBeInTheDocument();
    expect(screen.getAllByText("—").length).toBeGreaterThanOrEqual(3);
    expect(screen.getByLabelText("Outcome for Ahmed Ali")).toHaveValue("");
    // No destination select renders until an outcome is chosen for this row.
    expect(screen.queryByLabelText("Destination section for Ahmed Ali")).not.toBeInTheDocument();
  });

  it("keeps Confirm disabled until the Incomplete student's outcome is explicitly decided", async () => {
    apiMock.previewPromotion.mockResolvedValue(
      basePreview({
        students: [eligibleStudent({ eligible: null, suggestedOutcome: null, annualPercentage: null })],
      }),
    );
    const user = userEvent.setup();
    renderWizard();
    await preview(user);
    await user.selectOptions(screen.getByLabelText("To academic year", { exact: false }), "year-2");

    expect(screen.getByRole("button", { name: "Confirm promotion" })).toBeDisabled();

    await user.selectOptions(screen.getByLabelText("Outcome for Ahmed Ali"), "RETAINED");
    expect(screen.getByRole("button", { name: "Confirm promotion" })).toBeDisabled();

    await user.selectOptions(screen.getByLabelText("Destination section for Ahmed Ali"), "cur-a");
    expect(screen.getByRole("button", { name: "Confirm promotion" })).toBeEnabled();
  });

  it("submits assignments built from the reviewed table, one per student, on Confirm", async () => {
    apiMock.previewPromotion.mockResolvedValue(basePreview());
    apiMock.confirmPromotion.mockResolvedValue({ id: "batch-1", items: [{ id: "item-1", studentId: "student-1", outcome: "PROMOTED" }] });
    const user = userEvent.setup();
    renderWizard();
    await preview(user);
    await user.selectOptions(screen.getByLabelText("To academic year", { exact: false }), "year-2");

    await user.click(screen.getByRole("button", { name: "Confirm promotion" }));

    await waitFor(() =>
      expect(apiMock.confirmPromotion).toHaveBeenCalledWith("token", "school-1", "section-a", {
        fromAcademicYearId: "year-1",
        toAcademicYearId: "year-2",
        assignments: [{ enrollmentId: "enr-1", outcome: "PROMOTED", targetSectionId: "next-a" }],
      }),
    );
    expect(await screen.findByText(/Promotion confirmed/)).toBeInTheDocument();
  });

  it("switching a student's outcome away from Promote clears the previous destination, forcing a fresh pick", async () => {
    apiMock.previewPromotion.mockResolvedValue(basePreview());
    const user = userEvent.setup();
    renderWizard();
    await preview(user);

    await user.selectOptions(screen.getByLabelText("Outcome for Ahmed Ali"), "RETAINED");

    const destination = screen.getByLabelText("Destination section for Ahmed Ali") as HTMLSelectElement;
    expect(destination.value).toBe("");
  });
});

// Phase 1 — Promotion only moves students into an academic year the Admin
// has already created and that comes AFTER the source year, and a student
// below the pass mark can only be retained.
describe("PromotionWizard — target year and eligibility rules", () => {
  const EARLIER: AcademicYear = { id: "year-0", name: "2024-2025", startDate: "2024-01-01", endDate: "2024-12-31", isCurrent: false, terms: [] };

  it("only offers academic years that start AFTER the year being promoted from — never the same or an earlier one", async () => {
    apiMock.listAcademicYears.mockResolvedValue([EARLIER, ...YEARS]);
    apiMock.previewPromotion.mockResolvedValue(basePreview());
    const user = userEvent.setup();
    renderWizard();
    await preview(user);

    const toYear = screen.getByLabelText("To academic year", { exact: false }) as HTMLSelectElement;
    expect(Array.from(toYear.options).map((o) => o.textContent)).toEqual(["Select…", "2028"]);
  });

  it("with no later academic year, tells the Admin to create it first and never lets them confirm", async () => {
    apiMock.listAcademicYears.mockResolvedValue([YEARS[0]]); // only the current year exists
    apiMock.previewPromotion.mockResolvedValue(basePreview());
    const user = userEvent.setup();
    renderWizard();
    await preview(user);

    expect(screen.getByText(/Create the new academic year first/)).toBeInTheDocument();
    expect(screen.getByText(/Promotion never creates an academic year for you/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Confirm promotion" })).toBeDisabled();
    expect(apiMock.confirmPromotion).not.toHaveBeenCalled();
  });

  it("a student below 50% cannot be given the Promote outcome — only Retain is selectable", async () => {
    apiMock.previewPromotion.mockResolvedValue(
      basePreview({
        students: [eligibleStudent({ term1Percentage: 45, term2Percentage: 41, annualPercentage: 43, eligible: false, suggestedOutcome: "RETAINED" })],
      }),
    );
    const user = userEvent.setup();
    renderWizard();
    await preview(user);

    const outcome = screen.getByLabelText("Outcome for Ahmed Ali") as HTMLSelectElement;
    const optionFor = (value: string) => Array.from(outcome.options).find((o) => o.value === value)!;
    expect(optionFor("PROMOTED").disabled).toBe(true);
    expect(optionFor("RETAINED").disabled).toBe(false);
    expect(outcome.value).toBe("RETAINED");
  });

  it("an eligible student (exactly 50.00%) can still be promoted", async () => {
    apiMock.previewPromotion.mockResolvedValue(
      basePreview({ students: [eligibleStudent({ annualPercentage: 50, term1Percentage: 50, term2Percentage: 50, eligible: true })] }),
    );
    const user = userEvent.setup();
    renderWizard();
    await preview(user);

    const outcome = screen.getByLabelText("Outcome for Ahmed Ali") as HTMLSelectElement;
    expect(Array.from(outcome.options).find((o) => o.value === "PROMOTED")!.disabled).toBe(false);
    expect(screen.getByText("50.00%", { selector: "td.font-medium" })).toBeInTheDocument();
  });

  it("shows the API's message when the school structure is incomplete (e.g. Form 3 not created) instead of a Graduate outcome", async () => {
    apiMock.previewPromotion.mockRejectedValue(new ApiError("Form 2 can't be promoted yet — Form 3 has not been created in this school.", 400));
    const user = userEvent.setup();
    renderWizard();
    await waitFor(() => expect(screen.getByRole("button", { name: "Preview" })).toBeEnabled());
    await user.click(screen.getByRole("button", { name: "Preview" }));

    expect(await screen.findByText(/Form 3 has not been created/)).toBeInTheDocument();
    expect(screen.queryByText(/Graduate/)).not.toBeInTheDocument();
  });
});
