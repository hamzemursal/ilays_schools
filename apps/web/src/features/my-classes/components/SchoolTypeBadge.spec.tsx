import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import type { SchoolType } from "@/lib/api";
import { SchoolTypeBadge } from "./SchoolTypeBadge";

describe("SchoolTypeBadge — labels", () => {
  it.each([
    ["PRIMARY", "Primary"],
    ["SECONDARY", "Secondary"],
    ["PRIMARY_AND_SECONDARY", "Primary & Secondary"],
  ] satisfies [SchoolType, string][])("renders %s with label %s", (type, label) => {
    render(<SchoolTypeBadge type={type} />);
    expect(screen.getByText(label)).toBeInTheDocument();
  });
});

describe("SchoolTypeBadge — tone", () => {
  it("gives Primary the accent tone", () => {
    render(<SchoolTypeBadge type="PRIMARY" />);
    expect(screen.getByText("Primary").className).toContain("accent");
  });

  it("gives Secondary the shared violet decorative tone, not a semantic status color", () => {
    render(<SchoolTypeBadge type="SECONDARY" />);
    const badge = screen.getByText("Secondary");
    expect(badge.className).toContain("violet");
    expect(badge.className).not.toMatch(/success|warning|danger/);
  });

  it("gives a combined Primary & Secondary school a plain neutral badge", () => {
    render(<SchoolTypeBadge type="PRIMARY_AND_SECONDARY" />);
    const badge = screen.getByText("Primary & Secondary");
    expect(badge.className).not.toMatch(/accent|violet|success|warning|danger/);
  });
});
