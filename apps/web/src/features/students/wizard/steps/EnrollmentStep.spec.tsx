import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { AcademicYear, ClassWithSections } from "@/lib/api";
import { emptyWizardState, type WizardState } from "../types";
import { EnrollmentStep, isEnrollmentValid } from "./EnrollmentStep";

function year(overrides: Partial<AcademicYear> = {}): AcademicYear {
  return { id: "year-1", name: "2027", startDate: "2027-01-01", endDate: "2027-12-31", isCurrent: false, terms: [], ...overrides };
}

function klass(overrides: Partial<ClassWithSections> = {}): ClassWithSections {
  return {
    id: "class-1",
    name: "Class 1",
    level: 1,
    division: { id: "div-1", type: "PRIMARY" },
    sections: [
      { id: "section-a", name: "A", capacity: 30, _count: { enrollments: 10 } },
      { id: "section-b", name: "B", capacity: null, _count: { enrollments: 5 } },
    ],
    _count: { classSubjects: 4 },
    ...overrides,
  };
}

function renderStep(overrides: Partial<React.ComponentProps<typeof EnrollmentStep>> = {}, onChange = vi.fn()) {
  const utils = render(
    <EnrollmentStep
      state={emptyWizardState()}
      onChange={onChange}
      years={[year()]}
      classes={[klass()]}
      {...overrides}
    />,
  );
  return { onChange, ...utils };
}

describe("EnrollmentStep — prerequisites", () => {
  it("shows a warning instead of the form when there are no academic years", () => {
    renderStep({ years: [] });
    expect(screen.getByText(/needs at least one academic year and class/)).toBeInTheDocument();
    expect(screen.queryByLabelText("Academic year")).not.toBeInTheDocument();
  });

  it("shows a warning instead of the form when there are no classes", () => {
    renderStep({ classes: [] });
    expect(screen.getByText(/needs at least one academic year and class/)).toBeInTheDocument();
  });
});

describe("EnrollmentStep — selects", () => {
  it("marks the current academic year in its option label", () => {
    renderStep({ years: [year({ id: "year-2027", name: "2027", isCurrent: true })] });
    expect(screen.getByRole("option", { name: "2027 (current)" })).toBeInTheDocument();
  });

  // FormField appends a "*" marker inside the <label> for required fields,
  // so the label's accessible name is "Academic year*"/"Class*", not an
  // exact match — { exact: false } (substring match) handles that.
  it("reports the chosen academic year", async () => {
    const user = userEvent.setup();
    const { onChange } = renderStep();
    await user.selectOptions(screen.getByLabelText("Academic year", { exact: false }), "year-1");
    expect(onChange).toHaveBeenCalledWith({ academicYearId: "year-1" });
  });

  it("selecting a class also preselects that class's first section", async () => {
    const user = userEvent.setup();
    const { onChange } = renderStep();
    await user.selectOptions(screen.getByLabelText("Class", { exact: false }), "class-1");
    expect(onChange).toHaveBeenCalledWith({ classId: "class-1", sectionId: "section-a" });
  });

  it("clears the section when a class with no sections is chosen", async () => {
    const user = userEvent.setup();
    const { onChange } = renderStep({
      classes: [klass(), klass({ id: "class-2", name: "Class 2", sections: [] })],
    });
    await user.selectOptions(screen.getByLabelText("Class", { exact: false }), "class-2");
    expect(onChange).toHaveBeenCalledWith({ classId: "class-2", sectionId: "" });
  });

  it("disables the section select until a class is chosen", () => {
    renderStep();
    const [sectionSelect] = screen.getAllByRole("combobox").slice(-1);
    expect(sectionSelect).toBeDisabled();
  });

  it("shows each section with its capacity, or 'unlimited' when uncapped", async () => {
    renderStep({ state: { ...emptyWizardState(), classId: "class-1" } });
    expect(screen.getByRole("option", { name: "A (capacity 30)" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "B (unlimited)" })).toBeInTheDocument();
  });

  it("reports the chosen section", async () => {
    const user = userEvent.setup();
    const { onChange } = renderStep({ state: { ...emptyWizardState(), classId: "class-1" } });
    const sectionSelect = screen.getAllByRole("combobox").slice(-1)[0];
    await user.selectOptions(sectionSelect, "section-b");
    expect(onChange).toHaveBeenCalledWith({ sectionId: "section-b" });
  });
});

describe("EnrollmentStep — division badge", () => {
  it("shows Primary for a PRIMARY division", () => {
    renderStep({ state: { ...emptyWizardState(), classId: "class-1" } });
    expect(screen.getByText("Primary")).toBeInTheDocument();
  });

  it("shows Secondary for a non-PRIMARY division", () => {
    renderStep({
      classes: [klass({ division: { id: "div-2", type: "SECONDARY" } })],
      state: { ...emptyWizardState(), classId: "class-1" },
    });
    expect(screen.getByText("Secondary")).toBeInTheDocument();
  });

  it("shows no division badge until a class is chosen", () => {
    renderStep();
    expect(screen.queryByText("Primary")).not.toBeInTheDocument();
  });
});

describe("isEnrollmentValid", () => {
  it("is false when nothing is selected", () => {
    expect(isEnrollmentValid(emptyWizardState())).toBe(false);
  });

  it("is false when only some fields are selected", () => {
    expect(isEnrollmentValid({ ...emptyWizardState(), academicYearId: "year-1", classId: "class-1" })).toBe(false);
  });

  it("is true once year, class, and section are all selected", () => {
    expect(
      isEnrollmentValid({ ...emptyWizardState(), academicYearId: "year-1", classId: "class-1", sectionId: "section-a" }),
    ).toBe(true);
  });
});
