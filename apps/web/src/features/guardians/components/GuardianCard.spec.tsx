import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import type { GuardianRecord } from "@/lib/api";
import { GuardianCard } from "./GuardianCard";

function guardian(overrides: Partial<GuardianRecord> = {}): GuardianRecord {
  return {
    id: "guardian-1",
    firstName: "Amina",
    lastName: "Ali",
    phone: "0611111111",
    email: null,
    relationship: "MOTHER",
    isPrimaryContact: true,
    ...overrides,
  };
}

describe("GuardianCard — existing display", () => {
  it("renders the guardian's name, relationship, and contact info", () => {
    render(<GuardianCard guardian={guardian()} />);
    expect(screen.getByText("Amina Ali")).toBeInTheDocument();
    expect(screen.getByText("Mother")).toBeInTheDocument();
    expect(screen.getByText("0611111111")).toBeInTheDocument();
    expect(screen.getByText("Primary contact")).toBeInTheDocument();
  });
});

describe("GuardianCard — Parent Profile link", () => {
  it("omits the profile link when canViewProfile/schoolId are not supplied (unchanged for existing callers)", () => {
    render(<GuardianCard guardian={guardian()} />);
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("omits the profile link when canViewProfile is false", () => {
    render(<GuardianCard guardian={guardian()} schoolId="school-1" canViewProfile={false} />);
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("links to the existing Parent Profile route when canViewProfile is true", () => {
    render(<GuardianCard guardian={guardian()} schoolId="school-1" canViewProfile={true} />);
    const link = screen.getByRole("link", { name: /View profile/ });
    expect(link).toHaveAttribute("href", "/schools/school-1/parents/guardian-1");
  });
});
