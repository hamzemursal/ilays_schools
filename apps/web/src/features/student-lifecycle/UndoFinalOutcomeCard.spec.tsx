import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { StudentEnrollmentRecord } from "@/lib/api";
import { UndoFinalOutcomeCard } from "./UndoFinalOutcomeCard";

vi.mock("@/lib/auth-context", () => ({ ApiError: Error }));
const apiMock = vi.hoisted(() => ({ reverseFinalOutcome: vi.fn() }));
vi.mock("@/lib/api", () => ({ api: apiMock }));

const ENROLLMENT: StudentEnrollmentRecord = {
  id: "enr-f4",
  studentNumber: "STU-2026-2027-00022",
  rollNumber: 1,
  status: "GRADUATED",
  startDate: "2029-09-01",
  endDate: "2030-06-30",
  school: { id: "school-1", name: "SYL schools" },
  academicYear: { id: "y", name: "2029-2030", isCurrent: true },
  class: { id: "f4", name: "Form 4" },
  section: { id: "a", name: "A" },
};

beforeEach(() => vi.clearAllMocks());

describe("UndoFinalOutcomeCard", () => {
  it("asks for a reason, then restores the student via the API", async () => {
    apiMock.reverseFinalOutcome.mockResolvedValue({});
    const onRestored = vi.fn();
    render(<UndoFinalOutcomeCard accessToken="t" enrollment={ENROLLMENT} studentName="caasha ali" onRestored={onRestored} />);

    expect(screen.getByText(/Form 4 · A, 2029-2030/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Undo graduation" }));
    await userEvent.type(screen.getByRole("textbox"), "No Form 4 results — graduated by mistake");
    await userEvent.click(screen.getAllByRole("button", { name: "Undo graduation" }).at(-1)!);

    expect(apiMock.reverseFinalOutcome).toHaveBeenCalledWith("t", "school-1", "enr-f4", {
      reason: "No Form 4 results — graduated by mistake",
    });
    expect(onRestored).toHaveBeenCalled();
  });

  it("shows the server's reason when it can no longer be undone", async () => {
    apiMock.reverseFinalOutcome.mockRejectedValue(new Error("This student has moved on since (currently ARCHIVED)"));
    render(<UndoFinalOutcomeCard accessToken="t" enrollment={{ ...ENROLLMENT, status: "COMPLETED", class: { id: "c8", name: "Class 8" } }} studentName="Amina" onRestored={vi.fn()} />);

    await userEvent.click(screen.getByRole("button", { name: "Undo completion" }));
    await userEvent.type(screen.getByRole("textbox"), "mistake");
    await userEvent.click(screen.getAllByRole("button", { name: "Undo completion" }).at(-1)!);

    expect(await screen.findByText(/moved on since/)).toBeInTheDocument();
  });
});
