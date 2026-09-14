import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { VisibleColumnsSection } from "./VisibleColumnsSection";
import { ALL_OPTIONAL_COLUMN_IDS, DEFAULT_VISIBLE_COLUMNS } from "./columns";

function renderSection(overrides: Partial<React.ComponentProps<typeof VisibleColumnsSection>> = {}) {
  const onChange = vi.fn();
  const utils = render(<VisibleColumnsSection visibleColumns={[]} onChange={onChange} {...overrides} />);
  return { onChange, ...utils };
}

describe("VisibleColumnsSection — always visible, not a popup", () => {
  it("renders its checkbox grid directly in the page, with no trigger button needed to open it", () => {
    renderSection();
    expect(screen.getByText("Visible Columns")).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Date of Birth" })).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("collapses and re-expands the checkbox grid without unmounting the section header", async () => {
    const user = userEvent.setup();
    renderSection();
    await user.click(screen.getByRole("button", { name: "Collapse Visible Columns" }));
    expect(screen.queryByRole("checkbox", { name: "Date of Birth" })).not.toBeInTheDocument();
    expect(screen.getByText("Visible Columns")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Expand Visible Columns" }));
    expect(screen.getByRole("checkbox", { name: "Date of Birth" })).toBeInTheDocument();
  });
});

describe("VisibleColumnsSection — categories", () => {
  it("groups columns under all five categories", () => {
    renderSection();
    expect(screen.getByText("Student Information")).toBeInTheDocument();
    expect(screen.getByText("Parent / Guardian")).toBeInTheDocument();
    expect(screen.getByText("Fees & Payments")).toBeInTheDocument();
    expect(screen.getByText("Attendance")).toBeInTheDocument();
    expect(screen.getByText("Academic")).toBeInTheDocument();
  });

  it("pre-checks exactly the currently visible columns", () => {
    renderSection({ visibleColumns: ["status", "feeStatus"] });
    expect(screen.getByRole("checkbox", { name: "Status" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Fee Status" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Date of Birth" })).not.toBeChecked();
  });
});

describe("VisibleColumnsSection — toggling applies immediately", () => {
  it("calls onChange the instant a checkbox is clicked, with no separate Apply step", async () => {
    const user = userEvent.setup();
    const { onChange } = renderSection({ visibleColumns: ["status"] });
    await user.click(screen.getByRole("checkbox", { name: "Fee Status" }));
    expect(onChange).toHaveBeenCalledWith(expect.arrayContaining(["status", "feeStatus"]));
    expect(screen.queryByRole("button", { name: "Apply Columns" })).not.toBeInTheDocument();
  });

  it("unchecks and calls onChange without the removed id", async () => {
    const user = userEvent.setup();
    const { onChange } = renderSection({ visibleColumns: ["status", "feeStatus"] });
    await user.click(screen.getByRole("checkbox", { name: "Status" }));
    expect(onChange).toHaveBeenCalledWith(["feeStatus"]);
  });
});

describe("VisibleColumnsSection — Show All / Default", () => {
  it("Show All selects every registered optional column", async () => {
    const user = userEvent.setup();
    const { onChange } = renderSection();
    await user.click(screen.getByRole("button", { name: "Show All" }));
    expect(onChange).toHaveBeenCalledWith(ALL_OPTIONAL_COLUMN_IDS);
  });

  it("Default clears every optional column, leaving only the always-on core columns", async () => {
    const user = userEvent.setup();
    const { onChange } = renderSection({ visibleColumns: ["status", "feeStatus"] });
    await user.click(screen.getByRole("button", { name: "Default" }));
    expect(onChange).toHaveBeenCalledWith(DEFAULT_VISIBLE_COLUMNS);
  });
});
