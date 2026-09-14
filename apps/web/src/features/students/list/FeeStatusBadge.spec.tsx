import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import type { FeeStatus } from "@/lib/api";
import { FeeStatusBadge } from "./FeeStatusBadge";

describe("FeeStatusBadge — labels", () => {
  it.each([
    ["PAID", "Paid"],
    ["PARTIALLY_PAID", "Partially Paid"],
    ["PENDING", "Pending"],
    ["OVERDUE", "Overdue"],
    ["NO_CHARGE", "No Charge"],
  ] satisfies [FeeStatus, string][])("renders %s with label %s", (status, label) => {
    render(<FeeStatusBadge status={status} />);
    expect(screen.getByText(label)).toBeInTheDocument();
  });
});

const LABEL: Record<FeeStatus, string> = {
  PAID: "Paid",
  PARTIALLY_PAID: "Partially Paid",
  PENDING: "Pending",
  OVERDUE: "Overdue",
  NO_CHARGE: "No Charge",
};

describe("FeeStatusBadge — tone", () => {
  it.each([
    ["PAID", "success"],
    ["PARTIALLY_PAID", "warning"],
    ["PENDING", "warning"],
    ["OVERDUE", "danger"],
  ] satisfies [FeeStatus, string][])("gives %s the %s tone", (status, tone) => {
    render(<FeeStatusBadge status={status} />);
    expect(screen.getByText(LABEL[status]).className).toContain(tone);
  });

  it("gives NO_CHARGE the neutral tone (bordered, not a semantic color)", () => {
    render(<FeeStatusBadge status="NO_CHARGE" />);
    const badge = screen.getByText("No Charge");
    expect(badge.className).not.toMatch(/success|warning|danger/);
    expect(badge.className).toContain("border");
  });
});
