import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { AcademicYear, ClassWithSections, School } from "@/lib/api";
import { StudentListFilters, EMPTY_SECONDARY_FILTERS, type StudentListFilterState } from "./StudentListFilters";

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
  return { id: "year-1", name: "2027", startDate: "2027-01-01", endDate: "2027-12-31", isCurrent: true, terms: [], ...overrides };
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
    ...EMPTY_SECONDARY_FILTERS,
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
      canViewFinance={true}
      state={defaultState()}
      onChange={onChange}
      {...overrides}
    />,
  );
  return { onChange, ...utils };
}

async function openCategory(user: ReturnType<typeof userEvent.setup>, label: string) {
  await user.click(screen.getByRole("button", { name: new RegExp(`^${label}`) }));
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

describe("StudentListFilters — Search", () => {
  it("calls onChange as the search input changes", async () => {
    const user = userEvent.setup();
    const { onChange } = renderFilters();
    await user.type(screen.getByPlaceholderText("Search students, ID, roll no, or parent…"), "a");
    expect(onChange).toHaveBeenCalledWith({ search: "a" });
  });
});

describe("StudentListFilters — category tab bar", () => {
  const bothLevels = [
    klass({ id: "c1", division: { id: "div-1", type: "PRIMARY" } }),
    klass({ id: "c2", division: { id: "div-2", type: "SECONDARY" } }),
  ];

  it("shows all five categories when finance is viewable and the school has more than one level", () => {
    renderFilters({ canViewFinance: true, classes: bothLevels });
    expect(screen.getByRole("button", { name: /^Student/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Parents & Guardians/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Fees & Payments/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Attendance/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Academic/ })).toBeInTheDocument();
  });

  it("omits the Fees & Payments tab entirely when canViewFinance is false", () => {
    renderFilters({ canViewFinance: false });
    expect(screen.queryByRole("button", { name: /^Fees & Payments/ })).not.toBeInTheDocument();
  });

  it("omits the Academic tab entirely when the school only has one level (Class/Section are in the main row already)", () => {
    renderFilters({ classes: [klass({ division: { id: "div-1", type: "PRIMARY" } })] });
    expect(screen.queryByRole("button", { name: /^Academic/ })).not.toBeInTheDocument();
  });

  it("shows no category panel until a tab is clicked", () => {
    renderFilters();
    expect(screen.queryByText("Student Status", { selector: "label" })).not.toBeInTheDocument();
  });

  it("opens a category's panel when its tab is clicked, and closes it when clicked again", async () => {
    const user = userEvent.setup();
    renderFilters();
    await openCategory(user, "Student");
    expect(fieldSelect("Student Status")).toBeInTheDocument();
    await openCategory(user, "Student");
    expect(queryFieldSelect("Student Status")).not.toBeInTheDocument();
  });

  it("switches panels when a different tab is clicked", async () => {
    const user = userEvent.setup();
    renderFilters();
    await openCategory(user, "Student");
    expect(fieldSelect("Student Status")).toBeInTheDocument();
    await openCategory(user, "Parents & Guardians");
    expect(queryFieldSelect("Student Status")).not.toBeInTheDocument();
    expect(fieldSelect("Has Parent/Guardian")).toBeInTheDocument();
  });

  it("shows an active-filter count badge on a category with filters set", () => {
    renderFilters({ state: defaultState({ gender: "MALE", studentStatus: "ACTIVE" }) });
    expect(screen.getByRole("button", { name: /^Student.*2/ })).toBeInTheDocument();
  });
});

describe("StudentListFilters — Student category", () => {
  it("calls onChange with the chosen status", async () => {
    const user = userEvent.setup();
    const { onChange } = renderFilters();
    await openCategory(user, "Student");
    await user.selectOptions(fieldSelect("Student Status"), "WITHDRAWN");
    expect(onChange).toHaveBeenCalledWith({ studentStatus: "WITHDRAWN" });
  });

  it("calls onChange with the chosen gender", async () => {
    const user = userEvent.setup();
    const { onChange } = renderFilters();
    await openCategory(user, "Student");
    await user.selectOptions(fieldSelect("Gender"), "MALE");
    expect(onChange).toHaveBeenCalledWith({ gender: "MALE" });
  });

  it("resets only gender and status when Reset Student is clicked", async () => {
    const user = userEvent.setup();
    const { onChange } = renderFilters({ state: defaultState({ gender: "MALE", studentStatus: "ACTIVE", classId: "class-1" }) });
    await openCategory(user, "Student");
    await user.click(screen.getByRole("button", { name: "Reset Student" }));
    expect(onChange).toHaveBeenCalledWith({ studentStatus: "", gender: "" });
  });
});

describe("StudentListFilters — Parents & Guardians category", () => {
  it("calls onChange with the chosen Has Parent/Guardian value", async () => {
    const user = userEvent.setup();
    const { onChange } = renderFilters();
    await openCategory(user, "Parents & Guardians");
    await user.selectOptions(fieldSelect("Has Parent/Guardian"), "false");
    expect(onChange).toHaveBeenCalledWith({ hasParent: "false" });
  });

  it("calls onChange as the Parent/Guardian Name search box is typed into", async () => {
    const user = userEvent.setup();
    const { onChange } = renderFilters();
    await openCategory(user, "Parents & Guardians");
    await user.type(screen.getByPlaceholderText("Search by name…"), "A");
    expect(onChange).toHaveBeenCalledWith({ guardianName: "A" });
  });

  it("calls onChange with the chosen Relationship", async () => {
    const user = userEvent.setup();
    const { onChange } = renderFilters();
    await openCategory(user, "Parents & Guardians");
    await user.selectOptions(fieldSelect("Relationship"), "MOTHER");
    expect(onChange).toHaveBeenCalledWith({ guardianRelationship: "MOTHER" });
  });

  it("calls onChange with the chosen Has Parent Contact value", async () => {
    const user = userEvent.setup();
    const { onChange } = renderFilters();
    await openCategory(user, "Parents & Guardians");
    await user.selectOptions(fieldSelect("Has Parent Contact"), "true");
    expect(onChange).toHaveBeenCalledWith({ hasGuardianContact: "true" });
  });

  it("resets all four parent/guardian filters together when Reset Parents & Guardians is clicked", async () => {
    const user = userEvent.setup();
    const { onChange } = renderFilters({
      state: defaultState({ hasParent: "true", guardianName: "Amina", guardianRelationship: "MOTHER", hasGuardianContact: "false" }),
    });
    await openCategory(user, "Parents & Guardians");
    await user.click(screen.getByRole("button", { name: "Reset Parents & Guardians" }));
    expect(onChange).toHaveBeenCalledWith({ hasParent: "", guardianName: "", guardianRelationship: "", hasGuardianContact: "" });
  });
});

describe("StudentListFilters — Fees & Payments category", () => {
  it("calls onChange with the chosen Fee Status", async () => {
    const user = userEvent.setup();
    const { onChange } = renderFilters({ canViewFinance: true });
    await openCategory(user, "Fees & Payments");
    await user.selectOptions(fieldSelect("Fee Status"), "OVERDUE");
    expect(onChange).toHaveBeenCalledWith({ feeStatus: "OVERDUE" });
  });

  it("calls onChange with the chosen Outstanding Balance value", async () => {
    const user = userEvent.setup();
    const { onChange } = renderFilters({ canViewFinance: true });
    await openCategory(user, "Fees & Payments");
    await user.selectOptions(fieldSelect("Outstanding Balance"), "true");
    expect(onChange).toHaveBeenCalledWith({ hasOutstandingBalance: "true" });
  });
});

describe("StudentListFilters — Attendance category", () => {
  it("hides the Attendance % field when hasAttendanceData is false, but keeps Session and Status", async () => {
    const user = userEvent.setup();
    renderFilters({ hasAttendanceData: false });
    await openCategory(user, "Attendance");
    expect(queryFieldSelect("Attendance % (this year)")).not.toBeInTheDocument();
    expect(fieldSelect("Attendance Session")).toBeInTheDocument();
    expect(fieldSelect("Attendance Today")).toBeInTheDocument();
  });

  it("shows the Attendance % field when hasAttendanceData is true", async () => {
    const user = userEvent.setup();
    renderFilters({ hasAttendanceData: true });
    await openCategory(user, "Attendance");
    expect(fieldSelect("Attendance % (this year)")).toBeInTheDocument();
  });

  it("calls onChange with the chosen Attendance Session", async () => {
    const user = userEvent.setup();
    const { onChange } = renderFilters();
    await openCategory(user, "Attendance");
    await user.selectOptions(fieldSelect("Attendance Session"), "AFTERNOON");
    expect(onChange).toHaveBeenCalledWith({ attendanceTodaySession: "AFTERNOON" });
  });

  it("calls onChange with the chosen Attendance Today status", async () => {
    const user = userEvent.setup();
    const { onChange } = renderFilters();
    await openCategory(user, "Attendance");
    await user.selectOptions(fieldSelect("Attendance Today"), "NOT_RECORDED");
    expect(onChange).toHaveBeenCalledWith({ attendanceTodayStatus: "NOT_RECORDED" });
  });

  it("resets attendance-rate, session and status together when Reset Attendance is clicked", async () => {
    const user = userEvent.setup();
    const { onChange } = renderFilters({
      hasAttendanceData: true,
      state: defaultState({ attendanceFilter: "GOOD", attendanceTodaySession: "MORNING", attendanceTodayStatus: "ABSENT" }),
    });
    await openCategory(user, "Attendance");
    await user.click(screen.getByRole("button", { name: "Reset Attendance" }));
    expect(onChange).toHaveBeenCalledWith({ attendanceFilter: "ALL", attendanceTodayStatus: "", attendanceTodaySession: "" });
  });
});

describe("StudentListFilters — Class/Section (main row)", () => {
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

  it("offers only the selected class's own sections", () => {
    renderFilters({ state: defaultState({ classId: "class-1" }) });
    const sectionSelect = fieldSelect("Section");
    expect(sectionSelect).toBeEnabled();
    expect(within(sectionSelect).getByText("A")).toBeInTheDocument();
    expect(within(sectionSelect).getByText("B")).toBeInTheDocument();
  });
});

describe("StudentListFilters — Academic category (School Level)", () => {
  const bothLevels = [
    klass({ id: "c1", division: { id: "div-1", type: "PRIMARY" } }),
    klass({ id: "class-1", division: { id: "div-2", type: "SECONDARY" } }),
  ];

  it("hides the level filter (and the whole Academic tab) when the school only has one division type", () => {
    renderFilters({ classes: [klass({ division: { id: "div-1", type: "PRIMARY" } })] });
    expect(queryFieldSelect("School Level")).not.toBeInTheDocument();
  });

  it("shows the level filter only when both PRIMARY and SECONDARY classes exist", async () => {
    const user = userEvent.setup();
    renderFilters({ classes: bothLevels });
    await openCategory(user, "Academic");
    expect(fieldSelect("School Level")).toBeInTheDocument();
  });

  it("clears the selected class and section when the level changes", async () => {
    const user = userEvent.setup();
    const { onChange } = renderFilters({
      classes: bothLevels,
      state: defaultState({ classId: "c1", sectionId: "section-1" }),
    });
    await openCategory(user, "Academic");
    await user.selectOptions(fieldSelect("School Level"), "SECONDARY");
    expect(onChange).toHaveBeenCalledWith({ levelFilter: "SECONDARY", classId: "", sectionId: "" });
  });

  it("resets the level filter when Reset Academic is clicked", async () => {
    const user = userEvent.setup();
    const { onChange } = renderFilters({
      classes: bothLevels,
      state: defaultState({ levelFilter: "SECONDARY", classId: "class-1", sectionId: "section-1" }),
    });
    await openCategory(user, "Academic");
    await user.click(screen.getByRole("button", { name: "Reset Academic" }));
    expect(onChange).toHaveBeenCalledWith({ levelFilter: "ALL", classId: "", sectionId: "" });
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

  it("shows a chip for the fee status filter and clears it on remove", async () => {
    const user = userEvent.setup();
    const { onChange } = renderFilters({ state: defaultState({ feeStatus: "OVERDUE" }) });
    expect(screen.getByText("Fee: Overdue")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Remove Fee: Overdue filter" }));
    expect(onChange).toHaveBeenCalledWith({ feeStatus: "" });
  });

  it("shows a quoted chip for the guardian name filter and clears it on remove", async () => {
    const user = userEvent.setup();
    const { onChange } = renderFilters({ state: defaultState({ guardianName: "Amina" }) });
    expect(screen.getByText('Parent: "Amina"')).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: 'Remove Parent: "Amina" filter' }));
    expect(onChange).toHaveBeenCalledWith({ guardianName: "" });
  });

  it("shows a chip for the guardian relationship filter and clears it on remove", async () => {
    const user = userEvent.setup();
    const { onChange } = renderFilters({ state: defaultState({ guardianRelationship: "MOTHER" }) });
    expect(screen.getByText("Relationship: Mother")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Remove Relationship: Mother filter" }));
    expect(onChange).toHaveBeenCalledWith({ guardianRelationship: "" });
  });

  it("shows a chip for the has-parent-contact filter and clears it on remove", async () => {
    const user = userEvent.setup();
    const { onChange } = renderFilters({ state: defaultState({ hasGuardianContact: "true" }) });
    expect(screen.getByText("Has Parent Contact")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Remove Has Parent Contact filter" }));
    expect(onChange).toHaveBeenCalledWith({ hasGuardianContact: "" });
  });

  it("shows a chip for the attendance session filter and clears it on remove", async () => {
    const user = userEvent.setup();
    const { onChange } = renderFilters({ state: defaultState({ attendanceTodaySession: "AFTERNOON" }) });
    expect(screen.getByText("Session: Afternoon")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Remove Session: Afternoon filter" }));
    expect(onChange).toHaveBeenCalledWith({ attendanceTodaySession: "" });
  });

  it("shows a chip for the attendance-today filter and clears it on remove", async () => {
    const user = userEvent.setup();
    const { onChange } = renderFilters({ state: defaultState({ attendanceTodayStatus: "ABSENT" }) });
    expect(screen.getByText("Today: Absent")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Remove Today: Absent filter" }));
    expect(onChange).toHaveBeenCalledWith({ attendanceTodayStatus: "" });
  });

  it("shows no chips or Clear All when every filter is at its default", () => {
    renderFilters({ years: [] });
    expect(screen.queryByRole("button", { name: "Clear All" })).not.toBeInTheDocument();
  });

  it("resets every filter, including category ones, at once via Clear All", async () => {
    const user = userEvent.setup();
    const { onChange } = renderFilters({
      state: defaultState({
        levelFilter: "SECONDARY",
        classId: "class-1",
        sectionId: "section-1",
        attendanceFilter: "GOOD",
        search: "hodan",
        gender: "MALE",
        feeStatus: "OVERDUE",
      }),
      hasAttendanceData: true,
      classes: [
        klass({ id: "c1", division: { id: "div-1", type: "PRIMARY" } }),
        klass({ id: "class-1", division: { id: "div-2", type: "SECONDARY" } }),
      ],
    });
    await user.click(screen.getByRole("button", { name: "Clear All" }));
    expect(onChange).toHaveBeenCalledWith({
      levelFilter: "ALL",
      classId: "",
      sectionId: "",
      attendanceFilter: "ALL",
      search: "",
      ...EMPTY_SECONDARY_FILTERS,
    });
  });
});
