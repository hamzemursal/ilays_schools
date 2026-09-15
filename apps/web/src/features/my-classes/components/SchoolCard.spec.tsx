import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import type { TeachingSchool } from "../schoolGrouping";
import { SchoolCard } from "./SchoolCard";

const PRIMARY_SCHOOL: TeachingSchool = {
  id: "school-1",
  name: "Ilays Primary School",
  type: "PRIMARY",
  assignments: [],
  classCount: 2,
  sectionCount: 3,
  subjectCount: 2,
};

describe("SchoolCard", () => {
  it("shows the school's name and type", () => {
    render(<SchoolCard school={PRIMARY_SCHOOL} />);
    expect(screen.getByText("Ilays Primary School")).toBeInTheDocument();
    expect(screen.getByText("Primary")).toBeInTheDocument();
  });

  it("shows the school's own class/section/subject counts, pluralized correctly", () => {
    render(<SchoolCard school={PRIMARY_SCHOOL} />);
    expect(screen.getByText("2 classes · 3 sections · 2 subjects")).toBeInTheDocument();
  });

  it("singularizes counts of exactly 1", () => {
    render(<SchoolCard school={{ ...PRIMARY_SCHOOL, classCount: 1, sectionCount: 1, subjectCount: 1 }} />);
    expect(screen.getByText("1 class · 1 section · 1 subject")).toBeInTheDocument();
  });

  it("links to this school's own /my-classes/{schoolId} page", () => {
    render(<SchoolCard school={PRIMARY_SCHOOL} />);
    expect(screen.getByRole("link")).toHaveAttribute("href", "/my-classes/school-1");
  });
});
