import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import type { StudentListItem } from "@/lib/api";
import { StudentListSummaryCards } from "./StudentListSummaryCards";

function student(overrides: Partial<StudentListItem> = {}): StudentListItem {
  return {
    enrollmentId: "enr-1",
    studentId: "stu-1",
    firstName: "Hodan",
    lastName: "Ali",
    studentNumber: "STU-2027-00001",
    rollNumber: 1,
    className: "Class 1",
    sectionName: "A",
    classId: "class-1",
    sectionId: "section-1",
    academicYearId: "year-1",
    sex: "FEMALE",
    status: "ACTIVE",
    guardianName: null,
    guardianPhone: null,
    ...overrides,
  };
}

describe("StudentListSummaryCards — counts", () => {
  it("shows zero for every card with an empty student list", () => {
    render(<StudentListSummaryCards students={[]} attendanceRates={null} />);
    expect(screen.getByText("Total Students").previousSibling).toHaveTextContent("0");
    expect(screen.getByText("Active").previousSibling).toHaveTextContent("0");
    expect(screen.getByText("Male").previousSibling).toHaveTextContent("0");
    expect(screen.getByText("Female").previousSibling).toHaveTextContent("0");
  });

  it("counts total, active, male, and female independently of one another", () => {
    render(
      <StudentListSummaryCards
        students={[
          student({ enrollmentId: "e1", sex: "FEMALE", status: "ACTIVE" }),
          student({ enrollmentId: "e2", sex: "MALE", status: "ACTIVE" }),
          student({ enrollmentId: "e3", sex: "MALE", status: "WITHDRAWN" }),
          student({ enrollmentId: "e4", sex: "FEMALE", status: "GRADUATED" }),
        ]}
        attendanceRates={null}
      />,
    );
    expect(screen.getByText("Total Students").previousSibling).toHaveTextContent("4");
    expect(screen.getByText("Active").previousSibling).toHaveTextContent("2");
    expect(screen.getByText("Male").previousSibling).toHaveTextContent("2");
    expect(screen.getByText("Female").previousSibling).toHaveTextContent("2");
  });
});

describe("StudentListSummaryCards — average attendance", () => {
  it("omits the Average Attendance card entirely when attendanceRates is null", () => {
    render(<StudentListSummaryCards students={[student()]} attendanceRates={null} />);
    expect(screen.queryByText("Average Attendance")).not.toBeInTheDocument();
  });

  it("shows a dash when attendanceRates is provided but empty", () => {
    render(<StudentListSummaryCards students={[student()]} attendanceRates={new Map()} />);
    expect(screen.getByText("Average Attendance").previousSibling).toHaveTextContent("—");
  });

  it("averages only the students with a real (non-null) rate", () => {
    render(
      <StudentListSummaryCards
        students={[
          student({ enrollmentId: "e1" }),
          student({ enrollmentId: "e2" }),
          student({ enrollmentId: "e3" }),
        ]}
        attendanceRates={
          new Map([
            ["e1", 90],
            ["e2", 80],
            ["e3", null],
          ])
        }
      />,
    );
    // (90 + 80) / 2 = 85 — the null-rate student is excluded, not treated as 0.
    expect(screen.getByText("Average Attendance").previousSibling).toHaveTextContent("85%");
  });

  it("rounds the average to one decimal place", () => {
    render(
      <StudentListSummaryCards
        students={[student({ enrollmentId: "e1" }), student({ enrollmentId: "e2" }), student({ enrollmentId: "e3" })]}
        attendanceRates={
          new Map([
            ["e1", 90],
            ["e2", 81],
            ["e3", 70],
          ])
        }
      />,
    );
    // (90 + 81 + 70) / 3 = 80.333... -> rounds to 80.3
    expect(screen.getByText("Average Attendance").previousSibling).toHaveTextContent("80.3%");
  });
});
