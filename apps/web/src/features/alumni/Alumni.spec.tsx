import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { AlumniDirectoryResponse, LifecycleEnrollmentRow, StudentDetail } from "@/lib/api";
import { AlumniDirectory } from "./AlumniDirectory";
import { AlumniProfile, finishingEnrollment } from "./AlumniProfile";

const authMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth-context", () => ({ useAuth: () => authMock(), ApiError: Error }));

const apiMock = vi.hoisted(() => ({
  listAlumniDirectory: vi.fn(),
  listSchools: vi.fn(),
  listAcademicYears: vi.fn(),
  listLifecycleAcademicYearNames: vi.fn(),
  getStudentAttendanceHistory: vi.fn(),
}));
vi.mock("@/lib/api", () => ({ api: apiMock }));

const studentsApiMock = vi.hoisted(() => ({ getOne: vi.fn(), getPhotoUrl: vi.fn(), getResultsReport: vi.fn() }));
vi.mock("@/features/students/api", () => ({ studentsApi: studentsApiMock }));

function row(over: Partial<LifecycleEnrollmentRow> = {}): LifecycleEnrollmentRow {
  return {
    enrollmentId: "enr-1",
    studentId: "st-1",
    firstName: "Ahlam",
    lastName: "Ali",
    studentNumber: "STU-2025-2026-00001",
    rollNumber: 3,
    school: { id: "school-1", name: "SYL schools" },
    class: { id: "f4", name: "Form 4" },
    section: { id: "s", name: "A" },
    academicYear: { id: "y1", name: "2025-2026" },
    enrollmentStatus: "GRADUATED",
    lifecycleStatus: "GRADUATED",
    startDate: "2025-09-01",
    endDate: "2026-06-30",
    enrolledInForm1: false,
    transfer: null,
    divisionType: "SECONDARY",
    ...over,
  };
}

const RESPONSE: AlumniDirectoryResponse = {
  data: [row()],
  pagination: { page: 1, pageSize: 25, total: 1, totalPages: 1 },
  facets: { sectionNames: ["A", "B"] },
};

beforeEach(() => {
  vi.clearAllMocks();
  authMock.mockReturnValue({ accessToken: "token", user: { permissions: ["students.view", "results.view", "attendance.view"] } });
  apiMock.listAlumniDirectory.mockResolvedValue(RESPONSE);
  apiMock.listSchools.mockResolvedValue([{ id: "school-1", name: "SYL schools" }]);
  apiMock.listAcademicYears.mockResolvedValue([]);
  apiMock.listLifecycleAcademicYearNames.mockResolvedValue([{ name: "2025-2026", isCurrentAnywhere: true }]);
  apiMock.getStudentAttendanceHistory.mockResolvedValue([]);
});

describe("Alumni Directory", () => {
  it("shows official Alumni (Form 4 graduates) by default, labelled by type, linked to the read-only profile", async () => {
    render(<AlumniDirectory />);
    expect(await screen.findByText("1 alumnus")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Alumni" })).toBeInTheDocument();
    expect(apiMock.listAlumniDirectory).toHaveBeenCalledWith("token", expect.objectContaining({ divisionType: "SECONDARY" }));
    expect(screen.getByText("STU-2025-2026-00001")).toBeInTheDocument();
    expect(screen.getByText("Graduated — Form 4")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /View Ahlam Ali/ })).toHaveAttribute("href", "/schools/school-1/alumni/st-1");
  });

  it("keeps Class 8 completers separate: their own view, and a distinct type label when shown together", async () => {
    apiMock.listAlumniDirectory.mockResolvedValue({
      ...RESPONSE,
      data: [row(), row({ enrollmentId: "enr-2", studentId: "st-2", firstName: "Bile", enrollmentStatus: "COMPLETED", class: { id: "c8", name: "Class 8" }, divisionType: "PRIMARY" })],
      pagination: { ...RESPONSE.pagination, total: 2 },
    });
    render(<AlumniDirectory />);
    await screen.findByText("2 alumni");

    await userEvent.selectOptions(screen.getByLabelText("Type"), "PRIMARY");
    expect(await screen.findByRole("heading", { name: "Primary Completers" })).toBeInTheDocument();
    await waitFor(() => expect(apiMock.listAlumniDirectory).toHaveBeenLastCalledWith("token", expect.objectContaining({ divisionType: "PRIMARY" })));

    await userEvent.selectOptions(screen.getByLabelText("Type"), "");
    expect(await screen.findByRole("heading", { name: "Former Students" })).toBeInTheDocument();
    await waitFor(() => expect(apiMock.listAlumniDirectory).toHaveBeenLastCalledWith("token", expect.objectContaining({ divisionType: undefined })));
    expect(screen.getByText("Graduated — Form 4")).toBeInTheDocument();
    expect(screen.getByText("Completed — Class 8")).toBeInTheDocument();
  });

  it("sends the section and search filters to the directory endpoint", async () => {
    render(<AlumniDirectory fixedSchoolId="school-1" />);
    await screen.findByText("1 alumnus");

    await userEvent.selectOptions(screen.getByLabelText("Section"), "B");
    await userEvent.type(screen.getByLabelText("Search alumni"), "Ahlam");

    await waitFor(() =>
      expect(apiMock.listAlumniDirectory).toHaveBeenLastCalledWith(
        "token",
        expect.objectContaining({ schoolId: "school-1", divisionType: "SECONDARY", sectionName: "B", search: "Ahlam", page: 1 }),
      ),
    );
    // No School filter inside a single school's directory.
    expect(screen.queryByLabelText("School")).toBeNull();
  });
});

const STUDENT: StudentDetail = {
  id: "st-1",
  organizationId: "org",
  userId: null,
  firstName: "Ahlam",
  lastName: "Ali",
  dateOfBirth: "2008-05-14",
  sex: "FEMALE",
  legacyStudentNumber: null,
  currentStatus: "GRADUATED",
  guardians: [],
  transfers: [],
  enrollments: [
    {
      id: "e2",
      studentNumber: "STU-2025-2026-00001",
      rollNumber: 3,
      status: "GRADUATED",
      startDate: "2025-09-01",
      endDate: "2026-06-30",
      school: { id: "school-1", name: "SYL schools" },
      academicYear: { id: "y2", name: "2025-2026", isCurrent: true },
      class: { id: "f4", name: "Form 4" },
      section: { id: "s", name: "A" },
    },
    {
      id: "e1",
      studentNumber: "STU-2025-2026-00001",
      rollNumber: 7,
      status: "PROMOTED",
      startDate: "2024-09-01",
      endDate: "2025-06-30",
      school: { id: "school-1", name: "SYL schools" },
      academicYear: { id: "y1", name: "2024-2025", isCurrent: false },
      class: { id: "f3", name: "Form 3" },
      section: { id: "s3", name: "B" },
    },
  ],
};

describe("Alumni Profile", () => {
  beforeEach(() => {
    studentsApiMock.getOne.mockResolvedValue(STUDENT);
    studentsApiMock.getPhotoUrl.mockResolvedValue({ url: null });
    studentsApiMock.getResultsReport.mockResolvedValue({
      academicYear: { id: "y2", name: "2025-2026", isCurrent: true },
      enrollment: { schoolName: "SYL schools", className: "Form 4", sectionName: "A" },
      terms: [
        { name: "Term 1", termId: "t1", weight: 50, percentage: 80, results: [] },
        { name: "Term 2", termId: "t2", weight: 50, percentage: null, results: [] },
      ],
      otherResults: [],
      annual: { term1Percentage: 80, term2Percentage: null, annualPercentage: null },
    });
  });

  it("picks the GRADUATED enrollment as the finishing record", () => {
    expect(finishingEnrollment(STUDENT.enrollments)?.id).toBe("e2");
  });

  it("shows graduation facts in the header, all history tabs, and no edit or delete action", async () => {
    render(<AlumniProfile schoolId="school-1" studentId="st-1" />);

    expect(await screen.findByRole("heading", { name: "Ahlam Ali" })).toBeInTheDocument();
    expect(screen.getByText("Read-only")).toBeInTheDocument();
    expect(screen.getByText("Graduated — Form 4")).toBeInTheDocument();
    for (const tab of ["Overview", "Graduation", "Academic History", "Results", "Exams", "Attendance", "Enrollment", "Transfers"]) {
      expect(screen.getByRole("button", { name: tab })).toBeInTheDocument();
    }
    expect(screen.queryByRole("button", { name: /Edit/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Delete/ })).toBeNull();

    await userEvent.click(screen.getByRole("button", { name: "Graduation" }));
    expect(screen.getByText("Form 4 → GRADUATED → Alumni. No next-year enrollment.")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Enrollment" }));
    expect(screen.getByText("Form 3")).toBeInTheDocument();
    expect(screen.getByText("PROMOTED")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Results" }));
    await waitFor(() => expect(studentsApiMock.getResultsReport).toHaveBeenCalledWith("token", "st-1", "y2"));
  });

  it("titles an official Form 4 graduate's page as an Alumni Profile", async () => {
    render(<AlumniProfile schoolId="school-1" studentId="st-1" />);
    expect(await screen.findByRole("heading", { name: "Alumni Profile" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Alumni" })).toHaveAttribute("href", "/schools/school-1/alumni");
  });

  it("never presents a Class 8 completer as Form 4 alumni", async () => {
    studentsApiMock.getOne.mockResolvedValue({
      ...STUDENT,
      currentStatus: "COMPLETED",
      enrollments: [
        { ...STUDENT.enrollments[0], status: "COMPLETED", class: { id: "c8", name: "Class 8" } },
        { ...STUDENT.enrollments[1], class: { id: "c7", name: "Class 7" } },
      ],
    });
    render(<AlumniProfile schoolId="school-1" studentId="st-1" />);

    expect(await screen.findByRole("heading", { name: "Primary Completer Profile" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Primary Completers" })).toHaveAttribute("href", "/schools/school-1/alumni");
    expect(screen.getByText("Completed — Class 8")).toBeInTheDocument();
    expect(screen.getByText("Completion year")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Alumni Profile" })).toBeNull();
    expect(screen.queryByText(/Graduated/)).toBeNull();
    expect(screen.queryByText("Alumni")).toBeNull();
    expect(screen.queryByRole("button", { name: "Graduation" })).toBeNull();

    await userEvent.click(screen.getByRole("button", { name: "Completion" }));
    expect(screen.getByText("Class 8 → COMPLETED. Did not continue to Form 1.")).toBeInTheDocument();
    expect(screen.getByText("Completed — not continuing")).toBeInTheDocument();
  });
});
