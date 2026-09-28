import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { AcademicYear, ClassWithSections } from "@/lib/api";
import { Form1TransitionWizard } from "./Form1TransitionWizard";

const authMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth-context", () => ({ useAuth: () => authMock(), ApiError: Error }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }), useSearchParams: () => new URLSearchParams() }));

const apiMock = vi.hoisted(() => ({
  listAwaitingEnrollment: vi.fn(),
  listAcademicYears: vi.fn(),
  listClasses: vi.fn(),
  previewForm1Transition: vi.fn(),
}));
vi.mock("@/lib/api", () => ({ api: apiMock }));

// The NEW year is current; the students completed Class 8 in the old one.
const YEARS: AcademicYear[] = [
  { id: "y-old", name: "2027-2028", startDate: "2027-09-01", endDate: "2028-06-30", isCurrent: false, terms: [] },
  { id: "y-new", name: "2028-2029", startDate: "2028-09-01", endDate: "2029-06-30", isCurrent: true, terms: [] },
];
const form1 = (yearId: string): ClassWithSections => ({
  id: `form1-${yearId}`,
  name: "Form 1",
  level: 1,
  division: { id: "d", type: "SECONDARY" },
  sections: [{ id: `f1a-${yearId}`, name: "A", capacity: 40, _count: { enrollments: 0 } }],
  _count: { classSubjects: 0 },
});

beforeEach(() => {
  vi.clearAllMocks();
  authMock.mockReturnValue({ accessToken: "token" });
  apiMock.listAcademicYears.mockResolvedValue(YEARS);
  apiMock.listAwaitingEnrollment.mockResolvedValue({
    data: [
      {
        enrollmentId: "enr-1",
        studentId: "st-1",
        firstName: "Amina",
        lastName: "Ali",
        studentNumber: "STU-1",
        rollNumber: 1,
        school: { id: "school-1", name: "SYL" },
        class: { id: "c8", name: "Class 8" },
        section: { id: "s", name: "A" },
        academicYear: { id: "y-old", name: "2027-2028" },
        enrollmentStatus: "COMPLETED",
        lifecycleStatus: "COMPLETED",
        startDate: "2027-09-01",
        endDate: "2028-06-30",
        enrolledInForm1: false,
        transfer: null,
      },
    ],
    pagination: { page: 1, pageSize: 100, total: 1, totalPages: 1 },
  });
  apiMock.listClasses.mockImplementation((_t: string, _s: string, yearId?: string) => Promise.resolve(yearId === "y-old" ? [form1("y-old")] : [form1("y-new")]));
  apiMock.previewForm1Transition.mockResolvedValue({ toClass: { id: "x", name: "Form 1" }, eligible: [], ineligible: [], targetSections: [] });
});

describe("Form 1 Transition — destination Form 1 follows the chosen academic year", () => {
  it("uses the Form 1 of the selected destination year, not just the current year's", async () => {
    render(<Form1TransitionWizard schoolId="school-1" schoolName="SYL" />);
    await screen.findByText("Amina Ali");
    await userEvent.click(screen.getAllByRole("checkbox").at(-1)!);
    await userEvent.click(screen.getByRole("button", { name: /Next — 1 selected/ }));

    await userEvent.selectOptions(screen.getByRole("combobox"), "y-old");
    await waitFor(() => expect(apiMock.listClasses).toHaveBeenCalledWith("token", "school-1", "y-old"));
    await userEvent.click(await screen.findByRole("button", { name: "Preview" }));

    await waitFor(() =>
      expect(apiMock.previewForm1Transition).toHaveBeenCalledWith("token", "school-1", {
        toClassId: "form1-y-old",
        toAcademicYearId: "y-old",
        enrollmentIds: ["enr-1"],
      }),
    );
  });

  it("explains when the chosen year has no Form 1 class yet", async () => {
    apiMock.listClasses.mockResolvedValue([]);
    render(<Form1TransitionWizard schoolId="school-1" schoolName="SYL" />);
    await screen.findByText("Amina Ali");
    await userEvent.click(screen.getAllByRole("checkbox").at(-1)!);
    await userEvent.click(screen.getByRole("button", { name: /Next — 1 selected/ }));
    await userEvent.selectOptions(screen.getByRole("combobox"), "y-new");

    expect(await screen.findByText("No Form 1 class in that year")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Preview" })).toBeDisabled();
  });
});
