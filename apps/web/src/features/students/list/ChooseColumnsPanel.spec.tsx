import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ChooseColumnsPanel } from "./ChooseColumnsPanel";
import { DEFAULT_VISIBLE_COLUMNS } from "./columns";

function renderPanel(overrides: Partial<React.ComponentProps<typeof ChooseColumnsPanel>> = {}) {
  const onApply = vi.fn();
  const onClose = vi.fn();
  const utils = render(
    <ChooseColumnsPanel open={true} visibleColumns={DEFAULT_VISIBLE_COLUMNS} onApply={onApply} onClose={onClose} {...overrides} />,
  );
  return { onApply, onClose, ...utils };
}

describe("ChooseColumnsPanel — visibility", () => {
  it("renders nothing when closed", () => {
    render(<ChooseColumnsPanel open={false} visibleColumns={[]} onApply={vi.fn()} onClose={vi.fn()} />);
    expect(screen.queryByRole("dialog", { name: "Choose Columns" })).not.toBeInTheDocument();
  });

  it("renders the dialog when open", () => {
    renderPanel();
    expect(screen.getByRole("dialog", { name: "Choose Columns" })).toBeInTheDocument();
  });
});

describe("ChooseColumnsPanel — categories and defaults", () => {
  it("groups columns under all four categories", () => {
    renderPanel();
    expect(screen.getByText("Student")).toBeInTheDocument();
    expect(screen.getByText("Academic")).toBeInTheDocument();
    expect(screen.getByText("Finance")).toBeInTheDocument();
    expect(screen.getByText("Parent / Guardian")).toBeInTheDocument();
  });

  it("pre-checks exactly the currently visible columns", () => {
    renderPanel({ visibleColumns: ["name", "studentId"] });
    expect(screen.getByRole("checkbox", { name: "Student Name" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Roll Number" })).not.toBeChecked();
  });
});

describe("ChooseColumnsPanel — search", () => {
  it("filters the list as the search box is typed into", async () => {
    const user = userEvent.setup();
    renderPanel();
    await user.type(screen.getByLabelText("Search columns"), "fee");
    expect(screen.getByText("Fee Status")).toBeInTheDocument();
    expect(screen.queryByText("Student Name")).not.toBeInTheDocument();
  });

  it("shows a no-matches message when nothing matches", async () => {
    const user = userEvent.setup();
    renderPanel();
    await user.type(screen.getByLabelText("Search columns"), "zzzznomatch");
    expect(screen.getByText(/No columns match/)).toBeInTheDocument();
  });
});

describe("ChooseColumnsPanel — apply/reset", () => {
  it("calls onApply with the toggled draft, not the original prop", async () => {
    const user = userEvent.setup();
    const { onApply } = renderPanel({ visibleColumns: ["name"] });
    await user.click(screen.getByRole("checkbox", { name: "Student ID" }));
    await user.click(screen.getByRole("button", { name: "Apply Columns" }));
    expect(onApply).toHaveBeenCalledWith(expect.arrayContaining(["name", "studentId"]));
  });

  it("resets the draft to the default column set without applying it yet", async () => {
    const user = userEvent.setup();
    const { onApply } = renderPanel({ visibleColumns: ["name"] });
    await user.click(screen.getByRole("button", { name: "Reset to Default" }));
    expect(onApply).not.toHaveBeenCalled();
    expect(screen.getByRole("checkbox", { name: "Roll Number" })).toBeChecked();
  });

  it("re-seeds the draft from visibleColumns each time it reopens, discarding unsaved edits", async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <ChooseColumnsPanel open={true} visibleColumns={["name"]} onApply={vi.fn()} onClose={vi.fn()} />,
    );
    await user.click(screen.getByRole("checkbox", { name: "Student ID" }));
    rerender(<ChooseColumnsPanel open={false} visibleColumns={["name"]} onApply={vi.fn()} onClose={vi.fn()} />);
    rerender(<ChooseColumnsPanel open={true} visibleColumns={["name"]} onApply={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByRole("checkbox", { name: "Student ID" })).not.toBeChecked();
  });

  it("calls onClose when the backdrop is clicked", async () => {
    const user = userEvent.setup();
    const { onClose } = renderPanel();
    await user.click(screen.getByRole("dialog", { name: "Choose Columns" }).parentElement!);
    expect(onClose).toHaveBeenCalled();
  });
});
