import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { AcademicYear, ClassWithSections, School } from "@/lib/api";
import { StudentListFilters, type StudentListFilterState } from "./StudentListFilters";

const pushMock = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: pushMock }) }));

function school(overrides: Partial<School> = {}): School {
  return {
    id: "school-1",
    name: "Saamalay Primary School",
    type: "PRIMARY",
    status: "ACTIVE",
    address: null,
    phone: null,
    email: null,
    createdAt: "2027-01-01T00:00:00.000Z",
    studentCount: 0,
    teacherCount: 0,
    ...overrides,
  } as School;
}

function year(overrides: Partial<AcademicYear> = {}): AcademicYear {
  return { id: "year-1", name: "2027", startDate: "2027-01-01", endDate: "2027-12-31", isCurrent: true, ...overrides };
}

function klass(overrides: Partial<ClassWithSections> = {}): ClassWithSections {
  return {
    id: "class-1",
    name: "Class 1",
    level: 1,
    division: { id: "div-1", type: "PRIMARY" },
    sections: [
      { id: "section-1", name: "A", capacity: 30, _count: { enrollments: 10 } },
      { id: "section-2", name: "B", capacity: 30, _count: { enrollments: 8 } },
    ],
    _count: { classSubjects: 5 },
    ...overrides,
  };
}

function defaultState(overrides: Partial<StudentListFilterState> = {}): StudentListFilterState {
  return {
    yearId: "year-1",
    levelFilter: "ALL",
    classId: "",
    sectionId: "",
    attendanceFilter: "ALL",
    search: "",
    ...overrides,
  };
}

// The FormField label has no htmlFor/id linking it to its control (a known
// pattern across this codebase's forms — see e2e conventions), so
// getByLabelText can't find these selects; scope to the label's own
// container instead.
function fieldSelect(labelText: string): HTMLSelectElement {
  const label = screen.getByText(labelText, { selector: "label" });
  const select = label.parentElement?.querySelector("select");
  if (!select) throw new Error(`No <select> found for label "${labelText}"`);
  return select as HTMLSelectElement;
}

function queryFieldSelect(labelText: string): HTMLSelectElement | null {
  const label = screen.queryByText(labelText, { selector: "label" });
  return (label?.parentElement?.querySelector("select") as HTMLSelectElement | undefined) ?? null;
}

function renderFilters(overrides: Partial<React.ComponentProps<typeof StudentListFilters>> = {}) {
  const onChange = vi.fn();
  const utils = render(
    <StudentListFilters
      schoolId="school-1"
      schools={null}
      years={[year()]}
      classes={[klass()]}
      hasAttendanceData={false}
      state={defaultState()}
      onChange={onChange}
      {...overrides}
    />,
  );
  return { onChange, ...utils };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("StudentListFilters — School selector", () => {
  it("hides the School selector when schools is null (no schools.view permission)", () => {
    renderFilters({ schools: null });
    expect(queryFieldSelect("School")).not.toBeInTheDocument();
  });

  it("shows the School selector and navigates to the chosen school's students page", async () => {
    const user = userEvent.setup();
    renderFilters({ schools: [school(), school({ id: "school-2", name: "Ilays Secondary" })] });
    await user.selectOptions(fieldSelect("School"), "school-2");
    expect(pushMock).toHaveBeenCalledWith("/schools/school-2/students");
  });
});

describe("StudentListFilters — Academic Year", () => {
  it("hides the Academic Year field when there are no years", () => {
    renderFilters({ years: [] });
    expect(queryFieldSelect("Academic Year")).not.toBeInTheDocument();
  });

  it("marks the current year in its option label", () => {
    renderFilters({ years: [year({ id: "year-1", name: "2027", isCurrent: true })] });
    expect(screen.getByRole("option", { name: "2027 (current)" })).toBeInTheDocument();
  });

  it("calls onChange with the new yearId when changed", async () => {
    const user = userEvent.setup();
    const { onChange } = renderFilters({ years: [year(), year({ id: "year-2", name: "2026", isCurrent: false })] });
    await user.selectOptions(fieldSelect("Academic Year"), "year-2");
    expect(onChange).toHaveBeenCalledWith({ yearId: "year-2" });
  });
});

describe("StudentListFilters — School Level filter", () => {
  it("hides the level filter when the school only has one division type", () => {
    renderFilters({ classes: [klass({ division: { id: "div-1", type: "PRIMARY" } })] });
    expect(queryFieldSelect("School Level")).not.toBeInTheDocument();
  });

  it("shows the level filter only when both PRIMARY and SECONDARY classes exist", () => {
    renderFilters({
      classes: [
        klass({ id: "c1", division: { id: "div-1", type: "PRIMARY" } }),
        klass({ id: "c2", division: { id: "div-2", type: "SECONDARY" } }),
      ],
    });
    expect(fieldSelect("School Level")).toBeInTheDocument();
  });

  it("clears the selected class and section when the level changes", async () => {
    const user = userEvent.setup();
    const { onChange } = renderFilters({
      classes: [
        klass({ id: "c1", division: { id: "div-1", type: "PRIMARY" } }),
        klass({ id: "c2", division: { id: "div-2", type: "SECONDARY" } }),
      ],
      state: defaultState({ classId: "c1", sectionId: "section-1" }),
    });
    await user.selectOptions(fieldSelect("School Level"), "SECONDARY");
    expect(onChange).toHaveBeenCalledWith({ levelFilter: "SECONDARY", classId: "", sectionId: "" });
  });
});

describe("StudentListFilters — Class/Section cascade", () => {
  it("only offers classes matching the selected level", () => {
    renderFilters({
      classes: [
        klass({ id: "c1", name: "Class 1", division: { id: "div-1", type: "PRIMARY" } }),
        klass({ id: "c2", name: "Form 1", division: { id: "div-2", type: "SECONDARY" } }),
      ],
      state: defaultState({ levelFilter: "SECONDARY" }),
    });
    const classSelect = fieldSelect("Class");
    expect(within(classSelect).queryByText("Class 1")).not.toBeInTheDocument();
    expect(within(classSelect).getByText("Form 1")).toBeInTheDocument();
  });

  it("clears the section when the class changes", async () => {
    const user = userEvent.setup();
    const { onChange } = renderFilters({ state: defaultState({ sectionId: "section-1" }) });
    await user.selectOptions(fieldSelect("Class"), "class-1");
    expect(onChange).toHaveBeenCalledWith({ classId: "class-1", sectionId: "" });
  });

  it("disables the Section selector until a class is chosen", () => {
    renderFilters({ state: defaultState({ classId: "" }) });
    expect(fieldSelect("Section")).toBeDisabled();
  });

  it("offers only the selected class's own sections", async () => {
    const user = userEvent.setup();
    renderFilters({ state: defaultState({ classId: "class-1" }) });
    const sectionSelect = fieldSelect("Section");
    expect(sectionSelect).toBeEnabled();
    expect(within(sectionSelect).getByText("A")).toBeInTheDocument();
    expect(within(sectionSelect).getByText("B")).toBeInTheDocument();
  });
});

describe("StudentListFilters — Attendance filter", () => {
  it("hides the Attendance filter when hasAttendanceData is false", () => {
    renderFilters({ hasAttendanceData: false });
    expect(queryFieldSelect("Attendance")).not.toBeInTheDocument();
  });

  it("shows the Attendance filter when hasAttendanceData is true", async () => {
    const user = userEvent.setup();
    const { onChange } = renderFilters({ hasAttendanceData: true });
    await user.selectOptions(fieldSelect("Attendance"), "NEEDS_ATTENTION");
    expect(onChange).toHaveBeenCalledWith({ attendanceFilter: "NEEDS_ATTENTION" });
  });
});

describe("StudentListFilters — Search", () => {
  it("calls onChange as the search input changes", async () => {
    const user = userEvent.setup();
    const { onChange } = renderFilters();
    await user.type(screen.getByPlaceholderText("Search students, ID, roll no, or parent…"), "a");
    expect(onChange).toHaveBeenCalledWith({ search: "a" });
  });
});

describe("StudentListFilters — filter chips", () => {
  it("shows the current year as a non-removable chip", () => {
    renderFilters({ years: [year({ name: "2027", isCurrent: true })] });
    const chip = screen.getByText("2027");
    expect(within(chip.closest("span")!).queryByRole("button")).not.toBeInTheDocument();
  });

  it("shows a removable chip for a non-default level, and clears it on remove", async () => {
    const user = userEvent.setup();
    const { onChange } = renderFilters({
      classes: [
        klass({ id: "c1", division: { id: "div-1", type: "PRIMARY" } }),
        klass({ id: "c2", division: { id: "div-2", type: "SECONDARY" } }),
      ],
      state: defaultState({ levelFilter: "SECONDARY" }),
    });
    // "Secondary" also appears as an <option> in the Class select — scope to
    // the chip's own <span> (the Badge root) to avoid that collision.
    expect(screen.getByText("Secondary", { selector: "span" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Remove Secondary filter" }));
    // Removing the level chip goes through the same onLevelChange used by the
    // dropdown, which also clears any class/section picked under that level.
    expect(onChange).toHaveBeenCalledWith({ levelFilter: "ALL", classId: "", sectionId: "" });
  });

  it("shows a chip for the selected class and clears it on remove", async () => {
    const user = userEvent.setup();
    const { onChange } = renderFilters({ state: defaultState({ classId: "class-1" }) });
    // "Class 1" also appears as an <option> in the Class select itself.
    expect(screen.getByText("Class 1", { selector: "span" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Remove Class 1 filter" }));
    // Goes through the same onClassChange the dropdown uses, which also
    // clears whatever section was picked under that class.
    expect(onChange).toHaveBeenCalledWith({ classId: "", sectionId: "" });
  });

  it("shows a chip for the selected section and clears it on remove", async () => {
    const user = userEvent.setup();
    const { onChange } = renderFilters({ state: defaultState({ classId: "class-1", sectionId: "section-1" }) });
    expect(screen.getByText("Section A")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Remove Section A filter" }));
    expect(onChange).toHaveBeenCalledWith({ sectionId: "" });
  });

  it.each([
    ["EXCELLENT", "Excellent attendance"],
    ["GOOD", "Good attendance"],
    ["NEEDS_ATTENTION", "Needs attention"],
  ] as const)("shows a chip for the %s attendance filter", (value, label) => {
    renderFilters({ hasAttendanceData: true, state: defaultState({ attendanceFilter: value }) });
    expect(screen.getByText(label)).toBeInTheDocument();
  });

  it("shows a quoted chip for the search term and clears it on remove", async () => {
    const user = userEvent.setup();
    const { onChange } = renderFilters({ state: defaultState({ search: "hodan" }) });
    expect(screen.getByText('"hodan"')).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: 'Remove "hodan" filter' }));
    expect(onChange).toHaveBeenCalledWith({ search: "" });
  });

  it("shows no chips or Clear All when every filter is at its default", () => {
    renderFilters({ years: [] });
    expect(screen.queryByRole("button", { name: "Clear All" })).not.toBeInTheDocument();
  });

  it("resets every non-year filter at once via Clear All", async () => {
    const user = userEvent.setup();
    const { onChange } = renderFilters({
      state: defaultState({ levelFilter: "SECONDARY", classId: "class-1", sectionId: "section-1", attendanceFilter: "GOOD", search: "hodan" }),
      hasAttendanceData: true,
      classes: [
        klass({ id: "c1", division: { id: "div-1", type: "PRIMARY" } }),
        klass({ id: "class-1", division: { id: "div-2", type: "SECONDARY" } }),
      ],
    });
    await user.click(screen.getByRole("button", { name: "Clear All" }));
    expect(onChange).toHaveBeenCalledWith({ levelFilter: "ALL", classId: "", sectionId: "", attendanceFilter: "ALL", search: "" });
  });
});
