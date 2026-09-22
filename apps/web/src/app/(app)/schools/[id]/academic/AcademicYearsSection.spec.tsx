import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { AcademicYear } from "@/lib/api";
import { ToastProvider } from "@/components/ui/Toast";
import { AcademicYearsSection } from "./page";

vi.mock("next/link", () => ({
  default: ({ children, href, ...rest }: { children: React.ReactNode; href: string }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
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
vi.mock("@/lib/auth-context", () => ({ ApiError }));

const apiMock = vi.hoisted(() => ({
  createAcademicYear: vi.fn(),
  setCurrentAcademicYear: vi.fn(),
  getAcademicYearDeletionImpact: vi.fn(),
  deleteAcademicYear: vi.fn(),
  updateTermWeights: vi.fn(),
}));
vi.mock("@/lib/api", () => ({ api: apiMock }));

const CURRENT_YEAR: AcademicYear = {
  id: "year-2027",
  name: "2027",
  startDate: "2027-01-01",
  endDate: "2027-12-31",
  isCurrent: true,
  terms: [
    { id: "t1", name: "Term 1", weight: 50 },
    { id: "t2", name: "Term 2", weight: 50 },
  ],
};
const PREVIOUS_YEAR: AcademicYear = { ...CURRENT_YEAR, id: "year-2026", name: "2026", isCurrent: false };

function renderSection(years: AcademicYear[] = [PREVIOUS_YEAR, CURRENT_YEAR], canManage = true) {
  const setYears = vi.fn();
  render(
    <ToastProvider>
      <AcademicYearsSection schoolId="school-1" accessToken="token" years={years} setYears={setYears} canManage={canManage} />
    </ToastProvider>,
  );
  return { setYears };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("AcademicYearsSection — card navigation", () => {
  it("opening the PREVIOUS year's card links to that year's own detail page", () => {
    renderSection();

    const link = screen.getByRole("link", { name: /Open 2026/ });
    expect(link).toHaveAttribute("href", "/schools/school-1/academic/years/year-2026");
  });

  it("opening the CURRENT year's card links to that year's own detail page — never mixed with another year", () => {
    renderSection();

    const link = screen.getByRole("link", { name: /Open 2027/ });
    expect(link).toHaveAttribute("href", "/schools/school-1/academic/years/year-2027");
  });

  it("keeps the existing card design — Current Year / Previous Year badges and the date range are still shown", () => {
    renderSection();

    expect(screen.getByText("Current Year")).toBeInTheDocument();
    expect(screen.getByText("Previous Year")).toBeInTheDocument();
    expect(screen.getAllByText("Term 1 — 50%").length).toBeGreaterThan(0);
  });

  it("no longer shows an inline 'Add academic year' form at the bottom of the page", () => {
    renderSection();

    expect(screen.queryByText("Add academic year")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add year" })).not.toBeInTheDocument();
  });
});

describe("AcademicYearsSection — Create Academic Year modal", () => {
  it("shows a 'Create Academic Year' button, and clicking it opens the modal with the existing fields", async () => {
    const user = userEvent.setup();
    renderSection();

    const trigger = screen.getByRole("button", { name: "Create Academic Year" });
    expect(trigger).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    await user.click(trigger);

    const dialog = screen.getByRole("dialog");
    expect(dialog).toBeInTheDocument();
    expect(screen.getByLabelText("Academic Year Name", { exact: false })).toBeInTheDocument();
    expect(screen.getByLabelText("Start Date", { exact: false })).toBeInTheDocument();
    expect(screen.getByLabelText("End Date", { exact: false })).toBeInTheDocument();
  });

  it("does not show the Create Academic Year button for an actor without manage permission", () => {
    renderSection([PREVIOUS_YEAR, CURRENT_YEAR], false);

    expect(screen.queryByRole("button", { name: "Create Academic Year" })).not.toBeInTheDocument();
  });

  it("creating a year still calls the existing create API with the existing fields, and adds it to the list", async () => {
    const newYear: AcademicYear = {
      id: "year-2028",
      name: "2028",
      startDate: "2028-01-01",
      endDate: "2028-12-31",
      isCurrent: false,
      terms: [
        { id: "t1", name: "Term 1", weight: 50 },
        { id: "t2", name: "Term 2", weight: 50 },
      ],
    };
    apiMock.createAcademicYear.mockResolvedValue(newYear);
    const user = userEvent.setup();
    const { setYears } = renderSection();

    await user.click(screen.getByRole("button", { name: "Create Academic Year" }));
    await user.type(screen.getByLabelText("Academic Year Name", { exact: false }), "2028");
    await user.type(screen.getByLabelText("Start Date", { exact: false }), "2028-01-01");
    await user.type(screen.getByLabelText("End Date", { exact: false }), "2028-12-31");
    const dialog = screen.getByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Create Academic Year" }));

    await waitFor(() =>
      expect(apiMock.createAcademicYear).toHaveBeenCalledWith("token", "school-1", {
        name: "2028",
        startDate: "2028-01-01",
        endDate: "2028-12-31",
      }),
    );
    expect(setYears).toHaveBeenCalled();
    // The modal closes after a successful create.
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("shows the API's real error message and keeps the modal open on failure", async () => {
    apiMock.createAcademicYear.mockRejectedValue(new ApiError("An academic year with this name already exists for this school", 400));
    const user = userEvent.setup();
    renderSection();

    await user.click(screen.getByRole("button", { name: "Create Academic Year" }));
    await user.type(screen.getByLabelText("Academic Year Name", { exact: false }), "2027");
    await user.type(screen.getByLabelText("Start Date", { exact: false }), "2028-01-01");
    await user.type(screen.getByLabelText("End Date", { exact: false }), "2028-12-31");
    const dialog = screen.getByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Create Academic Year" }));

    expect(await screen.findByText(/already exists for this school/)).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("closes the modal without creating anything when Cancel is clicked", async () => {
    const user = userEvent.setup();
    renderSection();

    await user.click(screen.getByRole("button", { name: "Create Academic Year" }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(apiMock.createAcademicYear).not.toHaveBeenCalled();
  });
});
