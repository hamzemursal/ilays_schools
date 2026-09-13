import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import type { AcademicYear, ClassWithSections } from "@/lib/api";
import { emptyWizardState, type WizardGuardian, type WizardState } from "../types";
import { ReviewStep } from "./ReviewStep";

const YEARS: AcademicYear[] = [{ id: "year-1", name: "2027", startDate: "2027-01-01", endDate: "2027-12-31", isCurrent: true }];
const CLASSES: ClassWithSections[] = [
  {
    id: "class-1",
    name: "Class 1",
    level: 1,
    division: { id: "div-1", type: "PRIMARY" },
    sections: [{ id: "section-a", name: "A", capacity: 30, _count: { enrollments: 10 } }],
    _count: { classSubjects: 4 },
  },
];

function guardian(overrides: Partial<WizardGuardian> = {}): WizardGuardian {
  return {
    key: "g-1",
    mode: "existing",
    guardianId: "guardian-1",
    firstName: "Amina",
    lastName: "Ali",
    phone: "0611111111",
    email: "",
    relationship: "MOTHER",
    isPrimaryContact: true,
    ...overrides,
  };
}

const FILLED_STATE: WizardState = {
  ...emptyWizardState(),
  firstName: "Hodan",
  lastName: "Ali",
  dateOfBirth: "2015-05-01",
  sex: "FEMALE",
  academicYearId: "year-1",
  classId: "class-1",
  sectionId: "section-a",
};

function renderStep(state: WizardState = FILLED_STATE) {
  return render(<ReviewStep state={state} years={YEARS} classes={CLASSES} />);
}

describe("ReviewStep — student summary", () => {
  it("shows the student's name, date of birth, and sex", () => {
    renderStep();
    expect(screen.getByText("Hodan Ali")).toBeInTheDocument();
    expect(screen.getByText("2015-05-01")).toBeInTheDocument();
    expect(screen.getByText("Female")).toBeInTheDocument();
  });

  it("shows Male for a male student", () => {
    renderStep({ ...FILLED_STATE, sex: "MALE" });
    expect(screen.getByText("Male")).toBeInTheDocument();
  });
});

describe("ReviewStep — enrollment summary", () => {
  it("resolves and shows the chosen academic year, class, and section names", () => {
    renderStep();
    expect(screen.getByText("2027")).toBeInTheDocument();
    expect(screen.getByText("Class 1")).toBeInTheDocument();
    expect(screen.getByText("A")).toBeInTheDocument();
  });
});

describe("ReviewStep — guardians", () => {
  it("shows a 'none added' message when there are no guardians", () => {
    renderStep();
    expect(screen.getByText(/None added/)).toBeInTheDocument();
  });

  it("lists a guardian with their relationship and primary/mode badges", () => {
    renderStep({ ...FILLED_STATE, guardians: [guardian()] });
    expect(screen.getByText(/Amina Ali/)).toBeInTheDocument();
    expect(screen.getByText("(Mother)")).toBeInTheDocument();
    expect(screen.getByText("Primary")).toBeInTheDocument();
    expect(screen.getByText("Existing")).toBeInTheDocument();
  });

  it("labels a manually-created guardian as New, with no Primary badge", () => {
    renderStep({ ...FILLED_STATE, guardians: [guardian({ mode: "new", isPrimaryContact: false })] });
    expect(screen.getByText("New")).toBeInTheDocument();
    expect(screen.queryByText("Primary")).not.toBeInTheDocument();
  });
});
