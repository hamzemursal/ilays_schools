import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { AcademicYear, ClassWithSections, PromotionPreview, ProgressionOverview, School } from "@/lib/api";
import { Class8Progression } from "./Class8Progression";

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
  listSchools: vi.fn(),
  getProgressionOverview: vi.fn(),
  listClasses: vi.fn(),
  previewForm1Transition: vi.fn(),
  previewPromotion: vi.fn(),
  confirmPromotion: vi.fn(),
  confirmForm1Transition: vi.fn(),
}));
vi.mock("@/lib/api", () => ({ api: apiMock }));

const PRIMARY_YEARS: AcademicYear[] = [
  { id: "p-2025", name: "2025-2026", startDate: "2025-09-01", endDate: "2026-06-30", isCurrent: true, terms: [] },
  { id: "p-2026", name: "2026-2027", startDate: "2026-09-01", endDate: "2027-06-30", isCurrent: false, terms: [] },
];
const SECONDARY_YEARS: AcademicYear[] = [
  { id: "s-2025", name: "2025-2026", startDate: "2025-09-01", endDate: "2026-06-30", isCurrent: true, terms: [] },
  { id: "s-2026", name: "2026-2027", startDate: "2026-09-01", endDate: "2027-06-30", isCurrent: false, terms: [] },
];
const SCHOOLS = [
  { id: "primary", name: "Ilays Primary", type: "PRIMARY" },
  { id: "secondary", name: "Ilays Secondary", type: "SECONDARY" },
] as School[];

const OVERVIEW: ProgressionOverview = {
  academicYear: { id: "p-2025", name: "2025-2026" },
  classes: [
    {
      id: "c8",
      name: "Class 8",
      level: 8,
      divisionType: "PRIMARY",
      isFinal: true,
      sections: [
        { id: "c8-a", name: "A", activeCount: 3, progressedCount: 0 },
        { id: "c8-b", name: "B", activeCount: 1, progressedCount: 0 },
      ],
      activeCount: 4,
      progressedCount: 0,
    },
  ],
};

const FORM1: ClassWithSections[] = [
  {
    id: "f1",
    name: "Form 1",
    level: 1,
    division: { id: "d", type: "SECONDARY" },
    sections: [{ id: "f1-a", name: "A", capacity: 40, _count: { enrollments: 0 } }],
    _count: { classSubjects: 0 },
  },
];

function student(id: string, first: string, eligible: boolean | null, annual: number | null): PromotionPreview["students"][number] {
  return {
    studentId: `st-${id}`,
    enrollmentId: `enr-${id}`,
    firstName: first,
    lastName: "Test",
    rollNumber: 1,
    studentNumber: `STU-${id}`,
    term1Percentage: annual,
    term2Percentage: annual,
    annualPercentage: annual,
    eligible,
    suggestedOutcome: eligible === null ? null : eligible ? "COMPLETED" : "RETAINED",
  };
}

function preview(students: PromotionPreview["students"]): PromotionPreview {
  return {
    naturalOutcome: "COMPLETED",
    currentClass: { id: "c8", name: "Class 8" },
    nextClass: null,
    retainedClass: { id: "c8-next", name: "Class 8" },
    targetAcademicYear: { id: "p-2026", name: "2026-2027" },
    currentClassSections: [{ id: "c8n-a", name: "A", capacity: 40, currentActive: 0, available: 40 }],
    nextClassSections: [],
    warnings: [],
    students,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  authMock.mockReturnValue({ accessToken: "token", user: { schools: [{ id: "primary", name: "Ilays Primary" }] } });
  apiMock.listAcademicYears.mockImplementation((_t: string, schoolId: string) =>
    Promise.resolve(schoolId === "secondary" ? SECONDARY_YEARS : PRIMARY_YEARS),
  );
  apiMock.listSchools.mockResolvedValue(SCHOOLS);
  apiMock.getProgressionOverview.mockResolvedValue(OVERVIEW);
  apiMock.listClasses.mockResolvedValue(FORM1);
  apiMock.previewForm1Transition.mockResolvedValue({
    toClass: { id: "f1", name: "Form 1" },
    eligible: [],
    ineligible: [],
    targetSections: [{ id: "f1-a", name: "A", capacity: 40, currentActive: 0, available: 40 }],
  });
  apiMock.previewPromotion.mockImplementation((_t: string, _s: string, sectionId: string) =>
    Promise.resolve(
      sectionId === "c8-a"
        ? preview([student("1", "Amina", true, 72), student("2", "Bashir", false, 41), student("3", "Caalo", null, null)])
        : preview([student("4", "Deeqa", true, 66)]),
    ),
  );
  apiMock.confirmPromotion.mockResolvedValue({ id: "batch", items: [] });
  apiMock.confirmForm1Transition.mockResolvedValue({ id: "b2", results: [{}, {}] });
});

async function loadStudents() {
  render(<Class8Progression schoolId="primary" />);
  // Form 1 is suggested at the organization's Secondary school automatically.
  expect(await screen.findByText(/Ilays Secondary · 2026-2027 · Form 1/)).toBeInTheDocument();
  await userEvent.click(await screen.findByRole("button", { name: /Load 2 sections/ }));
  await screen.findByRole("radiogroup", { name: "Outcome for Amina Test" });
}

function outcome(name: string) {
  return screen.getByRole("radiogroup", { name: `Outcome for ${name}` });
}

describe("Class 8 Year-End Progression", () => {
  it("suggests the destination Secondary school's Form 1 and checks its capacity for that school", async () => {
    await loadStudents();
    expect(apiMock.previewForm1Transition).toHaveBeenCalledWith("token", "primary", {
      toClassId: "f1",
      toAcademicYearId: "s-2026",
      toSchoolId: "secondary",
      enrollmentIds: [],
    });
  });

  it("defaults each student's outcome from the result, and blocks Form 1/Complete below 50%", async () => {
    await loadStudents();

    expect(within(outcome("Amina Test")).getByRole("radio", { name: "Form 1" })).toHaveAttribute("aria-checked", "true");
    const bashir = outcome("Bashir Test");
    expect(within(bashir).getByRole("radio", { name: "Retain" })).toHaveAttribute("aria-checked", "true");
    expect(within(bashir).getByRole("radio", { name: "Form 1" })).toBeDisabled();
    expect(within(bashir).getByRole("radio", { name: "Complete" })).toBeDisabled();
    // Incomplete results: nothing chosen, Review blocked until decided.
    expect(within(outcome("Caalo Test")).queryByRole("radio", { checked: true })).toBeNull();
    expect(screen.getByRole("button", { name: "Review" })).toBeDisabled();
    expect(screen.getByText(/1 student\(s\) have incomplete results — retain them/)).toBeInTheDocument();
    // Incomplete results can only be retained.
    expect(within(outcome("Caalo Test")).getByRole("radio", { name: "Form 1" })).toBeDisabled();
    expect(within(outcome("Caalo Test")).getByRole("radio", { name: "Complete" })).toBeDisabled();
  });

  it("shows destinations as chips — Form 1 at the destination school, Class 8 next year for retention", async () => {
    await loadStudents();
    expect(screen.getByText(/Form 1 is at Ilays Secondary/)).toBeInTheDocument();
    expect(screen.getByLabelText("Class 8 section for Bashir Test")).toHaveValue("c8n-a");
    expect(screen.getByLabelText("Form 1 section for Amina Test")).toHaveValue("f1-a");
  });

  it("runs Class 8 completion per section, then enrolls the continuing students in Form 1 at the other school", async () => {
    await loadStudents();
    await userEvent.click(within(outcome("Caalo Test")).getByRole("radio", { name: "Retain" }));
    await userEvent.click(within(outcome("Deeqa Test")).getByRole("radio", { name: "Complete" }));
    await userEvent.click(screen.getByRole("button", { name: "Review" }));

    expect(screen.getByRole("region", { name: "Continue to Form 1" })).toHaveTextContent("1 student");
    expect(screen.getByRole("region", { name: "Retain" })).toHaveTextContent("2 students");
    expect(screen.getByRole("region", { name: "Complete — not continuing" })).toHaveTextContent("No new enrollment");

    await userEvent.click(screen.getByRole("button", { name: "Confirm Class 8 progression" }));
    await screen.findByText("Class 8 progression complete");

    expect(apiMock.confirmPromotion).toHaveBeenCalledWith("token", "primary", "c8-a", {
      fromAcademicYearId: "p-2025",
      toAcademicYearId: "p-2026",
      assignments: [
        { enrollmentId: "enr-1", outcome: "COMPLETED" },
        { enrollmentId: "enr-2", outcome: "RETAINED", targetSectionId: "c8n-a" },
        { enrollmentId: "enr-3", outcome: "RETAINED", targetSectionId: "c8n-a" },
      ],
    });
    // Section B has only a not-continuing student: no destination year needed.
    expect(apiMock.confirmPromotion).toHaveBeenCalledWith("token", "primary", "c8-b", {
      fromAcademicYearId: "p-2025",
      toAcademicYearId: undefined,
      assignments: [{ enrollmentId: "enr-4", outcome: "COMPLETED" }],
    });
    expect(apiMock.confirmForm1Transition).toHaveBeenCalledWith("token", "primary", {
      toClassId: "f1",
      toAcademicYearId: "s-2026",
      toSchoolId: "secondary",
      assignments: [{ enrollmentId: "enr-1", sectionId: "f1-a" }],
    });
  });

  it("explains a failed Form 1 step as a safe partial state and retries only that step", async () => {
    apiMock.confirmForm1Transition.mockRejectedValueOnce(new ApiError("Section A doesn't have room"));
    await loadStudents();
    await userEvent.click(within(outcome("Caalo Test")).getByRole("radio", { name: "Retain" }));
    await userEvent.click(screen.getByRole("button", { name: "Review" }));
    await userEvent.click(screen.getByRole("button", { name: "Confirm Class 8 progression" }));

    expect(await screen.findByText("Class 8 progression partly complete")).toBeInTheDocument();
    expect(screen.getByText(/2 students are waiting for Form 1 enrollment/)).toBeInTheDocument();
    expect(screen.getByText(/Section A doesn't have room/)).toBeInTheDocument();
    expect(screen.getByText(/No data was lost/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Retry Form 1 enrollment" }));
    await screen.findByText("Class 8 progression complete");
    expect(apiMock.confirmPromotion).toHaveBeenCalledTimes(2);
    expect(apiMock.confirmForm1Transition).toHaveBeenCalledTimes(2);
  });

  it("keeps Form 1 out of reach when the destination has no Form 1 class, while retain/complete still work", async () => {
    apiMock.listClasses.mockResolvedValue([]);
    render(<Class8Progression schoolId="primary" />);
    expect(await screen.findByText(/has no Form 1 class in that academic year yet/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Load 2 sections/ }));
    await screen.findByRole("radiogroup", { name: "Outcome for Amina Test" });
    expect(screen.getAllByText("Form 1 destination not ready").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Review" })).toBeDisabled();
  });
});
