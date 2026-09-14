import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import type { StudentDirectorySummary } from "@/lib/api";
import { StudentListSummaryCards } from "./StudentListSummaryCards";

function summary(overrides: Partial<StudentDirectorySummary> = {}): StudentDirectorySummary {
  return { total: 10, active: 8, presentToday: 6, outstandingBalances: 3, ...overrides };
}

describe("StudentListSummaryCards — loading", () => {
  it("shows a skeleton when loading", () => {
    const { container } = render(<StudentListSummaryCards summary={null} loading />);
    expect(container.querySelector(".animate-pulse")).not.toBeNull();
  });

  it("shows a skeleton when summary is null even without an explicit loading flag", () => {
    const { container } = render(<StudentListSummaryCards summary={null} />);
    expect(container.querySelector(".animate-pulse")).not.toBeNull();
  });
});

describe("StudentListSummaryCards — counts", () => {
  it("always shows Total Students and Active Students", () => {
    render(<StudentListSummaryCards summary={summary()} />);
    expect(screen.getByText("Total Students").previousSibling).toHaveTextContent("10");
    expect(screen.getByText("Active Students").previousSibling).toHaveTextContent("8");
  });

  it("shows Present Today when the backend included it", () => {
    render(<StudentListSummaryCards summary={summary({ presentToday: 6 })} />);
    expect(screen.getByText("Present Today").previousSibling).toHaveTextContent("6");
  });

  it("omits Present Today when the actor lacks attendance.view (backend sent null)", () => {
    render(<StudentListSummaryCards summary={summary({ presentToday: null })} />);
    expect(screen.queryByText("Present Today")).not.toBeInTheDocument();
  });

  it("shows Outstanding Payments when the backend included it", () => {
    render(<StudentListSummaryCards summary={summary({ outstandingBalances: 3 })} />);
    expect(screen.getByText("Outstanding Payments").previousSibling).toHaveTextContent("3");
  });

  it("omits Outstanding Payments when the actor lacks finance.ledger.view (backend sent null)", () => {
    render(<StudentListSummaryCards summary={summary({ outstandingBalances: null })} />);
    expect(screen.queryByText("Outstanding Payments")).not.toBeInTheDocument();
  });

  it("shows a zeroed summary correctly (not as a loading/empty state)", () => {
    render(<StudentListSummaryCards summary={summary({ total: 0, active: 0, presentToday: 0, outstandingBalances: 0 })} />);
    expect(screen.getByText("Total Students").previousSibling).toHaveTextContent("0");
    expect(screen.getByText("Present Today").previousSibling).toHaveTextContent("0");
  });
});
