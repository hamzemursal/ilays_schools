import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { TeachingSchool } from "../schoolGrouping";
import { SchoolSwitcher } from "./SchoolSwitcher";

const pushMock = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: pushMock }) }));

function school(id: string, name: string): TeachingSchool {
  return { id, name, type: "PRIMARY", assignments: [], classCount: 1, sectionCount: 1, subjectCount: 1 };
}

const SCHOOLS = [school("school-1", "Ilays Primary School"), school("school-2", "Ilays Secondary School")];

beforeEach(() => {
  pushMock.mockClear();
});

describe("SchoolSwitcher", () => {
  it("shows the current school's name on the closed trigger", () => {
    render(<SchoolSwitcher schools={SCHOOLS} currentSchoolId="school-1" />);
    expect(screen.getByRole("button", { name: /Ilays Primary School/ })).toBeInTheDocument();
  });

  it("lists every school when opened, marking the current one", async () => {
    const user = userEvent.setup();
    render(<SchoolSwitcher schools={SCHOOLS} currentSchoolId="school-1" />);
    await user.click(screen.getByRole("button", { name: /Ilays Primary School/ }));
    expect(screen.getAllByRole("menuitem")).toHaveLength(2);
  });

  it("navigates to the chosen school and closes the menu", async () => {
    const user = userEvent.setup();
    render(<SchoolSwitcher schools={SCHOOLS} currentSchoolId="school-1" />);
    await user.click(screen.getByRole("button", { name: /Ilays Primary School/ }));
    await user.click(screen.getByRole("menuitem", { name: /Ilays Secondary School/ }));
    expect(pushMock).toHaveBeenCalledWith("/my-classes/school-2");
    expect(screen.queryByRole("menuitem")).not.toBeInTheDocument();
  });

  it("does not navigate when re-selecting the already-current school", async () => {
    const user = userEvent.setup();
    render(<SchoolSwitcher schools={SCHOOLS} currentSchoolId="school-1" />);
    await user.click(screen.getByRole("button", { name: /Ilays Primary School/ }));
    await user.click(screen.getByRole("menuitem", { name: /Ilays Primary School/ }));
    expect(pushMock).not.toHaveBeenCalled();
  });
});
