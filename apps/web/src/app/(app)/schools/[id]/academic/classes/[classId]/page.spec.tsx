import { Suspense } from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, render, screen } from "@testing-library/react";
import type { AcademicYear, ClassWithSections, School } from "@/lib/api";
import { ToastProvider } from "@/components/ui/Toast";
import ClassDetailPage from "./page";

// This page's whole job, end to end, is: resolve a class slug for a
// SPECIFIC academic year (never silently falling back to whichever year is
// "current"), then re-validate that same class against a year-scoped list —
// see the regression this guards: apps/web/src/app/(app)/schools/[id]/
// academic/classes/[classId]/page.tsx previously called listClasses()
// without the resolved academicYearId, so a real, correctly-resolved
// previous-year class would vanish from that unscoped (current-year-
// defaulted) list and the page would wrongly report "Class not found".

const searchParamsMock = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => ({ get: (key: string) => searchParamsMock(key) }),
}));
vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
}));

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
  resolveSchool: vi.fn(),
  resolveAcademicYear: vi.fn(),
  resolveClass: vi.fn(),
  listClasses: vi.fn(),
  listClassSubjects: vi.fn(),
  listAcademicYears: vi.fn(),
  listSubjects: vi.fn(),
  listSections: vi.fn(),
  listStudents: vi.fn(),
  getStudentAttendanceRates: vi.fn(),
  listSectionTeacherAssignments: vi.fn(),
}));
vi.mock("@/lib/api", () => ({ api: apiMock }));

const SCHOOL: School = {
  id: "school-1",
  name: "Saamalay Secondary",
  type: "SECONDARY",
  status: "ACTIVE",
  address: null,
  phone: null,
  email: null,
  createdAt: "2020-01-01T00:00:00.000Z",
  studentCount: 0,
  teacherCount: 0,
  staffCount: 0,
  hasActiveAdmin: true,
};

const YEAR_2027: AcademicYear = {
  id: "year-2027",
  name: "2027",
  startDate: "2027-01-01",
  endDate: "2027-12-31",
  isCurrent: true,
  terms: [
    { id: "t1", name: "Term 1", weight: 50 },
    { id: "t2", name: "Term 2", weight: 50 },
  ],
};
const YEAR_2026: AcademicYear = { ...YEAR_2027, id: "year-2026", name: "2026", isCurrent: false };

function classFixture(overrides: Partial<ClassWithSections> = {}): ClassWithSections {
  return {
    id: "class-2027-form3",
    name: "Form 3",
    level: 3,
    division: { id: "div-secondary", type: "SECONDARY" },
    sections: [],
    _count: { classSubjects: 0 },
    ...overrides,
  };
}

const MANAGER = { accessToken: "token", user: { permissions: ["academic.manage", "academic.view"], schools: [{ id: "school-1", name: SCHOOL.name }] } };

beforeEach(() => {
  vi.clearAllMocks();
  authMock.mockReturnValue(MANAGER);
  searchParamsMock.mockReturnValue(null);
  apiMock.resolveSchool.mockResolvedValue(SCHOOL);
  apiMock.listAcademicYears.mockResolvedValue([YEAR_2027, YEAR_2026]);
  apiMock.listClassSubjects.mockResolvedValue([]);
  apiMock.listSubjects.mockResolvedValue([]);
  apiMock.listSections.mockResolvedValue([]);
  apiMock.listStudents.mockResolvedValue([]);
  apiMock.getStudentAttendanceRates.mockResolvedValue([]);
  apiMock.listSectionTeacherAssignments.mockResolvedValue([]);
});

async function renderPage(classSlug = "form-3") {
  const params = Promise.resolve({ id: "saamalay", classId: classSlug });
  await act(async () => {
    render(
      <ToastProvider>
        <Suspense fallback={null}>
          <ClassDetailPage params={params} />
        </Suspense>
      </ToastProvider>,
    );
  });
}

describe("ClassDetailPage — academic-year isolation", () => {
  it("loads a class that belongs to a PREVIOUS (non-current) academic year, given ?year= in the URL", async () => {
    searchParamsMock.mockReturnValue("2026");
    apiMock.resolveAcademicYear.mockResolvedValue(YEAR_2026);
    const class2026 = classFixture({ id: "class-2026-form3" });
    apiMock.resolveClass.mockResolvedValue(class2026);
    // A realistic, year-aware fake: only returns the class for the year it
    // actually belongs to — exactly like the real backend's
    // classYearReadWhere/resolveSchoolYear behavior.
    apiMock.listClasses.mockImplementation((_token: string, _schoolId: string, academicYearId?: string) =>
      Promise.resolve(academicYearId === "year-2026" ? [class2026] : [classFixture()]),
    );

    await renderPage();

    // The bug this regresses: the page used to call listClasses() with NO
    // year, which (per the real backend) silently defaults to the CURRENT
    // year — so a genuinely-resolved previous-year class would never be
    // found in that list.
    expect(await screen.findByText("Form 3")).toBeInTheDocument();
    expect(screen.queryByText("Class not found")).not.toBeInTheDocument();
    expect(apiMock.resolveClass).toHaveBeenCalledWith("token", "school-1", "form-3", "year-2026");
    expect(apiMock.listClasses).toHaveBeenCalledWith("token", "school-1", "year-2026");
  });

  it("loads a CURRENT-year class the same way when no ?year= is in the URL (unchanged behavior)", async () => {
    searchParamsMock.mockReturnValue(null);
    apiMock.resolveClass.mockResolvedValue(classFixture());
    apiMock.listClasses.mockResolvedValue([classFixture()]);

    await renderPage();

    expect(await screen.findByText("Form 3")).toBeInTheDocument();
    expect(apiMock.resolveClass).toHaveBeenCalledWith("token", "school-1", "form-3", undefined);
    // No year was resolved, so the re-validation call must still omit the
    // year param too — this must keep behaving exactly as it always did.
    expect(apiMock.listClasses).toHaveBeenCalledWith("token", "school-1", undefined);
  });

  it("never shows a class that belongs to a DIFFERENT academic year than the one selected", async () => {
    searchParamsMock.mockReturnValue("2026");
    apiMock.resolveAcademicYear.mockResolvedValue(YEAR_2026);
    // Simulates a stale/mismatched id slipping through resolveClass: the
    // year-scoped re-validation list for 2026 does NOT contain it, so the
    // page must refuse to show it rather than rendering wrong-year data.
    apiMock.resolveClass.mockResolvedValue(classFixture({ id: "class-2027-form3" }));
    apiMock.listClasses.mockImplementation((_token: string, _schoolId: string, academicYearId?: string) =>
      Promise.resolve(academicYearId === "year-2026" ? [] : [classFixture()]),
    );

    await renderPage();

    expect(await screen.findByText("Class not found")).toBeInTheDocument();
  });

  it("never shows a class that does not belong to this school", async () => {
    apiMock.resolveClass.mockRejectedValue(new ApiError("Class not found", 404));

    await renderPage();

    expect(await screen.findByText("Class not found")).toBeInTheDocument();
    expect(apiMock.listClasses).not.toHaveBeenCalled();
  });
});
