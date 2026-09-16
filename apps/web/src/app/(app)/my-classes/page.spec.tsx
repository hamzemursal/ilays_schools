import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import type { Teacher, TeacherAssignmentRecord } from "@/lib/api";
import { ToastProvider } from "@/components/ui/Toast";
import MyClassesPage from "./page";

const apiMock = vi.hoisted(() => ({
  getMyTeacherProfile: vi.fn(),
  getMyPhotoUrl: vi.fn().mockResolvedValue({ url: null }),
  myAssignmentStudents: vi.fn().mockResolvedValue({ students: [] }),
  listMyDocuments: vi.fn().mockResolvedValue([]),
  uploadMyDocument: vi.fn(),
  uploadMyPhoto: vi.fn(),
  updateMyTeacherProfile: vi.fn(),
}));
vi.mock("@/lib/api", () => ({ api: apiMock }));

const authMock = vi.hoisted(() => ({
  useAuth: vi.fn(() => ({
    accessToken: "token-1",
    user: { permissions: ["attendance.mark"], schools: [] },
  })),
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
vi.mock("@/lib/auth-context", () => ({ useAuth: authMock.useAuth, ApiError }));

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

function assignment(overrides: Partial<TeacherAssignmentRecord> & { id: string }): TeacherAssignmentRecord {
  return {
    schoolId: "school-a",
    school: { id: "school-a", name: "Ilays Primary School", type: "PRIMARY" },
    academicYearId: "year-1",
    academicYear: { id: "year-1", name: "2027", isCurrent: true },
    subject: { id: "subject-math", name: "Mathematics" },
    section: { id: "section-5a", name: "5A", class: { id: "class-5", name: "Class 5" } },
    ...overrides,
  } as TeacherAssignmentRecord;
}

function teacher(overrides: Partial<Teacher> = {}): Teacher {
  return {
    id: "teacher-1",
    userId: "user-1",
    teacherCode: "TCH-00001",
    employeeNumber: "EMP-00001",
    firstName: "Ahmed",
    lastName: "Mohamed",
    sex: null,
    dateOfBirth: null,
    phone: null,
    email: null,
    address: null,
    qualification: null,
    specialization: null,
    employmentDate: null,
    emergencyContactName: null,
    emergencyContactPhone: null,
    status: "ACTIVE",
    assignments: [],
    ...overrides,
  };
}

function renderPage() {
  return render(
    <ToastProvider>
      <MyClassesPage />
    </ToastProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  apiMock.getMyPhotoUrl.mockResolvedValue({ url: null });
  apiMock.myAssignmentStudents.mockResolvedValue({ students: [] });
  apiMock.listMyDocuments.mockResolvedValue([]);
});

describe("MyClassesPage — exactly one school", () => {
  it("shows the single-school subtitle and this school's classes/subjects inline, with no extra click needed", async () => {
    apiMock.getMyTeacherProfile.mockResolvedValue(teacher({ assignments: [assignment({ id: "a1" })] }));
    renderPage();

    expect(await screen.findByText("You teach at 1 school. View your classes, subjects, and students.")).toBeInTheDocument();
    // "My classes"/"My subjects" content is already visible — never gated
    // behind clicking the school card first. The one assignment renders in
    // both sections (by year, by subject), so "Class 5 · 5A" legitimately
    // appears twice.
    expect((await screen.findAllByText("Class 5 · 5A")).length).toBe(2);
    expect(screen.getAllByText("Mathematics").length).toBeGreaterThan(0);
  });

  it("still shows the school as a context card, alongside the inline classes/subjects", async () => {
    apiMock.getMyTeacherProfile.mockResolvedValue(teacher({ assignments: [assignment({ id: "a1" })] }));
    renderPage();

    expect(await screen.findByText("Ilays Primary School")).toBeInTheDocument();
  });
});

describe("MyClassesPage — multiple schools", () => {
  it("shows the multi-school subtitle and requires opening a school — no classes/subjects rendered inline", async () => {
    apiMock.getMyTeacherProfile.mockResolvedValue(
      teacher({
        assignments: [
          assignment({ id: "a1" }),
          assignment({
            id: "a2",
            schoolId: "school-b",
            school: { id: "school-b", name: "Ilays Secondary School", type: "SECONDARY" },
            subject: { id: "subject-physics", name: "Physics" },
            section: { id: "section-form2a", name: "2A", class: { id: "form-2", name: "Form 2" } },
          }),
        ],
      }),
    );
    renderPage();

    expect(await screen.findByText("You teach at 2 schools. Open one to see its classes and subjects.")).toBeInTheDocument();
    expect(screen.getByText("Ilays Primary School")).toBeInTheDocument();
    expect(screen.getByText("Ilays Secondary School")).toBeInTheDocument();
    // Never mix two schools' data into one flat list on this page — the
    // per-school class/subject content only ever renders once a school is
    // actually opened (a separate route), not here.
    expect(screen.queryByText("Class 5 · 5A")).not.toBeInTheDocument();
    expect(screen.queryByText("Form 2 · 2A")).not.toBeInTheDocument();
  });
});

describe("MyClassesPage — no schools", () => {
  it("shows the empty state, not a subtitle claiming a school count", async () => {
    apiMock.getMyTeacherProfile.mockResolvedValue(teacher({ assignments: [] }));
    renderPage();

    expect(await screen.findByText("No assignments yet.")).toBeInTheDocument();
    expect(screen.queryByText(/You teach at/)).not.toBeInTheDocument();
  });
});
