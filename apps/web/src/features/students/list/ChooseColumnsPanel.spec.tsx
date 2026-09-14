import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ChooseColumnsPanel } from "./ChooseColumnsPanel";
import { DEFAULT_VISIBLE_COLUMNS } from "./columns";

async function renderOpenPanel(overrides: Partial<React.ComponentProps<typeof ChooseColumnsPanel>> = {}) {
  const onApply = vi.fn();
  const user = userEvent.setup();
  const utils = render(<ChooseColumnsPanel visibleColumns={DEFAULT_VISIBLE_COLUMNS} onApply={onApply} {...overrides} />);
  await user.click(screen.getByRole("button", { name: "Choose Columns" }));
  return { onApply, user, ...utils };
}

describe("ChooseColumnsPanel — visibility", () => {
  it("renders only the trigger button when closed", () => {
    render(<ChooseColumnsPanel visibleColumns={[]} onApply={vi.fn()} />);
    expect(screen.queryByRole("dialog", { name: "Choose Columns" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Choose Columns" })).toBeInTheDocument();
  });

  it("opens the popover when the trigger button is clicked", async () => {
    await renderOpenPanel();
    expect(screen.getByRole("dialog", { name: "Choose Columns" })).toBeInTheDocument();
  });

  it("closes the popover when its own close button is clicked", async () => {
    const { user } = await renderOpenPanel();
    await user.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog", { name: "Choose Columns" })).not.toBeInTheDocument();
  });

  it("closes the popover when Escape is pressed", async () => {
    const { user } = await renderOpenPanel();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: "Choose Columns" })).not.toBeInTheDocument();
  });

  it("closes the popover when clicking outside it", async () => {
    const { user } = await renderOpenPanel();
    await user.click(document.body);
    expect(screen.queryByRole("dialog", { name: "Choose Columns" })).not.toBeInTheDocument();
  });
});

describe("ChooseColumnsPanel — categories and defaults", () => {
  it("groups columns under all four categories", async () => {
    await renderOpenPanel();
    expect(screen.getByText("Student")).toBeInTheDocument();
    expect(screen.getByText("Academic")).toBeInTheDocument();
    expect(screen.getByText("Finance")).toBeInTheDocument();
    expect(screen.getByText("Parent / Guardian")).toBeInTheDocument();
  });

  it("pre-checks exactly the currently visible columns", async () => {
    await renderOpenPanel({ visibleColumns: ["name", "studentId"] });
    expect(screen.getByRole("checkbox", { name: "Student Name" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Roll Number" })).not.toBeChecked();
  });
});

describe("ChooseColumnsPanel — search", () => {
  it("filters the list as the search box is typed into", async () => {
    const { user } = await renderOpenPanel();
    await user.type(screen.getByLabelText("Search columns"), "fee");
    expect(screen.getByText("Fee Status")).toBeInTheDocument();
    expect(screen.queryByText("Student Name")).not.toBeInTheDocument();
  });

  it("shows a no-matches message when nothing matches", async () => {
    const { user } = await renderOpenPanel();
    await user.type(screen.getByLabelText("Search columns"), "zzzznomatch");
    expect(screen.getByText(/No columns match/)).toBeInTheDocument();
  });
});

describe("ChooseColumnsPanel — apply/reset", () => {
  it("calls onApply with the toggled draft, not the original prop, and closes the popover", async () => {
    const { user, onApply } = await renderOpenPanel({ visibleColumns: ["name"] });
    await user.click(screen.getByRole("checkbox", { name: "Student ID" }));
    await user.click(screen.getByRole("button", { name: "Apply Columns" }));
    expect(onApply).toHaveBeenCalledWith(expect.arrayContaining(["name", "studentId"]));
    expect(screen.queryByRole("dialog", { name: "Choose Columns" })).not.toBeInTheDocument();
  });

  it("resets the draft to the default column set without applying it yet", async () => {
    const { user, onApply } = await renderOpenPanel({ visibleColumns: ["name"] });
    await user.click(screen.getByRole("button", { name: "Reset to Default" }));
    expect(onApply).not.toHaveBeenCalled();
    expect(screen.getByRole("checkbox", { name: "Roll Number" })).toBeChecked();
  });

  it("re-seeds the draft from visibleColumns each time it reopens, discarding unsaved edits", async () => {
    const user = userEvent.setup();
    render(<ChooseColumnsPanel visibleColumns={["name"]} onApply={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "Choose Columns" }));
    await user.click(screen.getByRole("checkbox", { name: "Student ID" }));
    await user.keyboard("{Escape}");
    await user.click(screen.getByRole("button", { name: "Choose Columns" }));
    expect(screen.getByRole("checkbox", { name: "Student ID" })).not.toBeChecked();
  });
});
