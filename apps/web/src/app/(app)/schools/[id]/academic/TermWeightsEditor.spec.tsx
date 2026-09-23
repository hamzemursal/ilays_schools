import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { AcademicYear } from "@/lib/api";
import { ToastProvider } from "@/components/ui/Toast";
import { TermWeightsEditor } from "./page";

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
vi.mock("@/lib/auth-context", () => ({ ApiError }));

const apiMock = vi.hoisted(() => ({ updateTermWeights: vi.fn() }));
vi.mock("@/lib/api", () => ({ api: apiMock }));

const YEAR: AcademicYear = {
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

function renderEditor(canManage = true, onSaved = vi.fn()) {
  render(
    <ToastProvider>
      <TermWeightsEditor schoolId="school-1" accessToken="token" year={YEAR} canManage={canManage} onSaved={onSaved} />
    </ToastProvider>,
  );
  return { onSaved };
}

beforeEach(() => vi.clearAllMocks());

describe("TermWeightsEditor", () => {
  it("shows the current Term 1 / Term 2 weights read-only when the actor can't manage academics", () => {
    renderEditor(false);
    expect(screen.getByText("Term 1 — 50%")).toBeInTheDocument();
    expect(screen.getByText("Term 2 — 50%")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Edit weights" })).not.toBeInTheDocument();
  });

  it("disables Save while the two weights don't sum to 100", async () => {
    const user = userEvent.setup();
    renderEditor();
    await user.click(screen.getByRole("button", { name: "Edit weights" }));

    const term1Input = screen.getByLabelText("Term 1 weight", { exact: false });
    await user.clear(term1Input);
    await user.type(term1Input, "40");

    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    expect(screen.getByText(/must sum to exactly 100/)).toBeInTheDocument();
  });

  it("enables Save once weights sum to exactly 100 and submits them", async () => {
    apiMock.updateTermWeights.mockResolvedValue({ ...YEAR, terms: [{ id: "term-1", name: "Term 1", weight: 40 }, { id: "term-2", name: "Term 2", weight: 60 }] });
    const user = userEvent.setup();
    const { onSaved } = renderEditor();
    await user.click(screen.getByRole("button", { name: "Edit weights" }));

    const term1Input = screen.getByLabelText("Term 1 weight", { exact: false });
    const term2Input = screen.getByLabelText("Term 2 weight", { exact: false });
    await user.clear(term1Input);
    await user.type(term1Input, "40");
    await user.clear(term2Input);
    await user.type(term2Input, "60");

    expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(apiMock.updateTermWeights).toHaveBeenCalledWith("token", "school-1", "year-1", {
        term1Weight: 40,
        term2Weight: 60,
      }),
    );
    expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({ terms: expect.any(Array) }));
  });

  it("rejects a sum over 100 just as clearly as a sum under 100", async () => {
    const user = userEvent.setup();
    renderEditor();
    await user.click(screen.getByRole("button", { name: "Edit weights" }));

    const term2Input = screen.getByLabelText("Term 2 weight", { exact: false });
    await user.clear(term2Input);
    await user.type(term2Input, "60");

    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  });

  // Regression: the Academic Year detail page resolves a year through an
  // endpoint whose response previously omitted `terms` (a real backend gap,
  // now fixed) — this crashed the whole page with "Cannot read properties
  // of undefined (reading 'find')". This component must never assume
  // `terms` is present, no matter what a caller passes in.
  it("renders nothing instead of crashing when the year is missing its terms array", () => {
    const yearWithoutTerms = { ...YEAR, terms: undefined } as unknown as AcademicYear;
    expect(() =>
      render(
        <ToastProvider>
          <TermWeightsEditor schoolId="school-1" accessToken="token" year={yearWithoutTerms} canManage={true} onSaved={vi.fn()} />
        </ToastProvider>,
      ),
    ).not.toThrow();
    expect(screen.queryByText(/Term 1/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Edit weights" })).not.toBeInTheDocument();
  });
});
