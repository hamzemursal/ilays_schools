import { useState } from "react";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { AcademicYear } from "@/lib/api";
import { BasicInfoStep, isBasicInfoValid } from "./BasicInfoStep";
import { emptyExamWizardState, type ExamWizardState } from "../types";

const YEAR_WITH_TERMS: AcademicYear = {
  id: "year-1",
  name: "2027",
  startDate: "2027-01-01",
  endDate: "2027-12-31",
  isCurrent: true,
  terms: [
    { id: "term-1", name: "Term 1", weight: 50 },
    { id: "term-2", name: "Term 2", weight: 50 },
  ],
};

const OTHER_YEAR: AcademicYear = {
  id: "year-2",
  name: "2028",
  startDate: "2028-01-01",
  endDate: "2028-12-31",
  isCurrent: false,
  terms: [
    { id: "term-3", name: "Term 1", weight: 40 },
    { id: "term-4", name: "Term 2", weight: 60 },
  ],
};

function Harness({ years, initialTermId = "" }: { years: AcademicYear[]; initialTermId?: string }) {
  const [state, setState] = useState<ExamWizardState>({
    ...emptyExamWizardState(years[0]?.id ?? ""),
    termId: initialTermId,
  });
  return (
    <BasicInfoStep
      state={state}
      years={years}
      onChange={(patch) => setState((prev) => ({ ...prev, ...patch }))}
    />
  );
}

describe("isBasicInfoValid — Term is required", () => {
  it("is invalid without a name, year, or term even when dates are fine", () => {
    const state = { ...emptyExamWizardState(""), name: "Mid-Term", academicYearId: "year-1", termId: "" };
    expect(isBasicInfoValid(state, [YEAR_WITH_TERMS])).toBe(false);
  });

  it("is valid once name, year, and term are all set", () => {
    const state = { ...emptyExamWizardState(""), name: "Mid-Term", academicYearId: "year-1", termId: "term-1" };
    expect(isBasicInfoValid(state, [YEAR_WITH_TERMS])).toBe(true);
  });
});

describe("BasicInfoStep — Term selector", () => {
  it("offers exactly the selected year's two terms — never a third option like Mid-Term or Term 3", () => {
    render(<Harness years={[YEAR_WITH_TERMS]} />);

    const termSelect = screen.getByLabelText("Term", { exact: false }) as HTMLSelectElement;
    const optionLabels = Array.from(termSelect.options).map((o) => o.textContent);

    expect(optionLabels).toEqual(["Select…", "Term 1 (50%)", "Term 2 (50%)"]);
  });

  it("disables the Term selector and prompts to pick a year first when no academic year is selected", () => {
    render(<Harness years={[]} />);

    const termSelect = screen.getByLabelText("Term", { exact: false }) as HTMLSelectElement;
    expect(termSelect).toBeDisabled();
    expect(termSelect.options[0].textContent).toBe("Select an academic year first");
  });

  it("never pre-selects a term — a fresh form has none chosen, so Term 1 can't be saved by accident", () => {
    render(<Harness years={[YEAR_WITH_TERMS]} />);

    const termSelect = screen.getByLabelText("Term", { exact: false }) as HTMLSelectElement;
    expect(termSelect.value).toBe("");
    expect(isBasicInfoValid({ ...emptyExamWizardState("year-1"), name: "Term 2 Exam" }, [YEAR_WITH_TERMS])).toBe(false);
  });

  it("clears the chosen term when the academic year changes (the old year's term id isn't valid for the new one) and does NOT default to Term 1", async () => {
    const user = userEvent.setup();
    render(<Harness years={[YEAR_WITH_TERMS, OTHER_YEAR]} initialTermId="term-1" />);

    const yearSelect = screen.getByLabelText("Academic Year", { exact: false });
    await user.selectOptions(yearSelect, "year-2");

    const termSelect = screen.getByLabelText("Term", { exact: false }) as HTMLSelectElement;
    expect(termSelect.value).toBe("");
    const optionLabels = Array.from(termSelect.options).map((o) => o.textContent);
    expect(optionLabels).toEqual(["Select…", "Term 1 (40%)", "Term 2 (60%)"]);
  });
});
