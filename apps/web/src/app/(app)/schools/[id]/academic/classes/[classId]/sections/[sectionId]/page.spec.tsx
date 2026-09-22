import { Suspense } from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, render, screen } from "@testing-library/react";
import type { AcademicYear, ClassWithSections, School, Section } from "@/lib/api";
import { ToastProvider } from "@/components/ui/Toast";
import SectionWorkspacePage from "./page";

// Same regression this guards as the Class detail page one level up: the
// page used to re-validate its already year-resolved class via
// listClasses() with NO academicYearId, which (per the real backend)
// silently defaults to the CURRENT year — so a genuinely-resolved
// previous-year section's parent class would vanish from that list and the
// page would wrongly report "Section not found in this class".

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
  resolveSection: vi.fn(),
  listClasses: vi.fn(),
  listSections: vi.fn(),
  listAcademicYears: vi.fn(),
  listClassSubjects: vi.fn(),
  listExams: vi.fn(),
  listTeachers: vi.fn(),
  addTeacherAssignment: vi.fn(),
  listSectionTeacherAssignments: vi.fn(),
  listSectionStudents: vi.fn(),
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

function sectionFixture(overrides: Partial<Section> = {}): Section {
  return { id: "section-a", name: "Section A", capacity: null, _count: { enrollments: 0 }, ...overrides };
}

const MANAGER = { accessToken: "token", user: { permissions: ["academic.manage", "academic.view"], schools: [{ id: "school-1", name: SCHOOL.name }] } };

beforeEach(() => {
  vi.clearAllMocks();
  authMock.mockReturnValue(MANAGER);
  searchParamsMock.mockReturnValue(null);
  apiMock.resolveSchool.mockResolvedValue(SCHOOL);
  apiMock.resolveSection.mockResolvedValue(sectionFixture());
  apiMock.listAcademicYears.mockResolvedValue([YEAR_2027, YEAR_2026]);
  apiMock.listClassSubjects.mockResolvedValue([]);
  apiMock.listExams.mockResolvedValue([]);
  apiMock.listTeachers.mockResolvedValue([]);
  apiMock.listSectionTeacherAssignments.mockResolvedValue([]);
  apiMock.listSectionStudents.mockResolvedValue([]);
});

async function renderPage() {
  const params = Promise.resolve({ id: "saamalay", classId: "form-3", sectionId: "section-a" });
  await act(async () => {
    render(
      <ToastProvider>
        <Suspense fallback={null}>
          <SectionWorkspacePage params={params} />
        </Suspense>
      </ToastProvider>,
    );
  });
}

describe("SectionWorkspacePage — academic-year isolation", () => {
  it("loads a section whose class belongs to a PREVIOUS (non-current) academic year, given ?year= in the URL", async () => {
    searchParamsMock.mockReturnValue("2026");
    apiMock.resolveAcademicYear.mockResolvedValue(YEAR_2026);
    const class2026 = classFixture({ id: "class-2026-form3" });
    const section2026 = sectionFixture({ id: "section-2026-a" });
    apiMock.resolveClass.mockResolvedValue(class2026);
    apiMock.resolveSection.mockResolvedValue(section2026);
    // Year-aware fake, same shape as the real backend's classYearReadWhere/
    // resolveSchoolYear default-to-current behavior.
    apiMock.listClasses.mockImplementation((_token: string, _schoolId: string, academicYearId?: string) =>
      Promise.resolve(academicYearId === "year-2026" ? [class2026] : [classFixture()]),
    );
    apiMock.listSections.mockResolvedValue([section2026]);

    await renderPage();

    expect(await screen.findByText("Form 3")).toBeInTheDocument();
    expect(screen.queryByText("Section not found in this class")).not.toBeInTheDocument();
    expect(apiMock.resolveClass).toHaveBeenCalledWith("token", "school-1", "form-3", "year-2026");
    expect(apiMock.listClasses).toHaveBeenCalledWith("token", "school-1", "year-2026");
  });

  it("loads a CURRENT-year section the same way when no ?year= is in the URL (unchanged behavior)", async () => {
    searchParamsMock.mockReturnValue(null);
    apiMock.resolveClass.mockResolvedValue(classFixture());
    apiMock.listClasses.mockResolvedValue([classFixture()]);
    apiMock.listSections.mockResolvedValue([sectionFixture()]);

    await renderPage();

    expect(await screen.findByText("Form 3")).toBeInTheDocument();
    expect(apiMock.resolveClass).toHaveBeenCalledWith("token", "school-1", "form-3", undefined);
    expect(apiMock.listClasses).toHaveBeenCalledWith("token", "school-1", undefined);
  });

  it("never shows a section whose class belongs to a DIFFERENT academic year than the one selected", async () => {
    searchParamsMock.mockReturnValue("2026");
    apiMock.resolveAcademicYear.mockResolvedValue(YEAR_2026);
    apiMock.resolveClass.mockResolvedValue(classFixture({ id: "class-2027-form3" }));
    apiMock.resolveSection.mockResolvedValue(sectionFixture());
    // The year-scoped re-validation list for 2026 does not contain this
    // class, so the page must refuse to render it.
    apiMock.listClasses.mockImplementation((_token: string, _schoolId: string, academicYearId?: string) =>
      Promise.resolve(academicYearId === "year-2026" ? [] : [classFixture()]),
    );
    apiMock.listSections.mockResolvedValue([sectionFixture()]);

    await renderPage();

    expect(await screen.findByText("Section not found in this class")).toBeInTheDocument();
  });

  it("never shows a class/section that does not belong to this school", async () => {
    apiMock.resolveClass.mockRejectedValue(new ApiError("Class not found", 404));

    await renderPage();

    expect(await screen.findByText("Class not found")).toBeInTheDocument();
    expect(apiMock.listClasses).not.toHaveBeenCalled();
  });
});
