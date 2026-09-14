import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ExportMenu } from "./ExportMenu";

function renderMenu(overrides: Partial<React.ComponentProps<typeof ExportMenu>> = {}) {
  const onExportCurrentView = vi.fn();
  const onExportAllFiltered = vi.fn();
  const onExportSelected = vi.fn();
  const onPrint = vi.fn();
  const utils = render(
    <ExportMenu
      selectedCount={0}
      onExportCurrentView={onExportCurrentView}
      onExportAllFiltered={onExportAllFiltered}
      onExportSelected={onExportSelected}
      onPrint={onPrint}
      {...overrides}
    />,
  );
  return { onExportCurrentView, onExportAllFiltered, onExportSelected, onPrint, ...utils };
}

describe("ExportMenu — menu contents", () => {
  it("is closed by default", () => {
    renderMenu();
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("opens to show Export Current View, Export All Filtered, and Print, but not Export Selected when nothing is selected", async () => {
    const user = userEvent.setup();
    renderMenu({ selectedCount: 0 });
    await user.click(screen.getByRole("button", { name: "Export" }));
    expect(screen.getByRole("menuitem", { name: "Export Current View" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Export All Filtered Students" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /Print Current View/ })).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: /Export Selected/ })).not.toBeInTheDocument();
  });

  it("shows Export Selected Students with the count when a selection exists", async () => {
    const user = userEvent.setup();
    renderMenu({ selectedCount: 5 });
    await user.click(screen.getByRole("button", { name: "Export" }));
    expect(screen.getByRole("menuitem", { name: "Export Selected Students (5)" })).toBeInTheDocument();
  });
});

describe("ExportMenu — actions", () => {
  it("calls onExportCurrentView and closes the menu", async () => {
    const user = userEvent.setup();
    const { onExportCurrentView } = renderMenu();
    await user.click(screen.getByRole("button", { name: "Export" }));
    await user.click(screen.getByRole("menuitem", { name: "Export Current View" }));
    expect(onExportCurrentView).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("calls onExportAllFiltered", async () => {
    const user = userEvent.setup();
    const { onExportAllFiltered } = renderMenu();
    await user.click(screen.getByRole("button", { name: "Export" }));
    await user.click(screen.getByRole("menuitem", { name: "Export All Filtered Students" }));
    expect(onExportAllFiltered).toHaveBeenCalledTimes(1);
  });

  it("calls onExportSelected", async () => {
    const user = userEvent.setup();
    const { onExportSelected } = renderMenu({ selectedCount: 2 });
    await user.click(screen.getByRole("button", { name: "Export" }));
    await user.click(screen.getByRole("menuitem", { name: "Export Selected Students (2)" }));
    expect(onExportSelected).toHaveBeenCalledTimes(1);
  });

  it("calls onPrint", async () => {
    const user = userEvent.setup();
    const { onPrint } = renderMenu();
    await user.click(screen.getByRole("button", { name: "Export" }));
    await user.click(screen.getByRole("menuitem", { name: /Print Current View/ }));
    expect(onPrint).toHaveBeenCalledTimes(1);
  });

  it("closes when clicking outside", async () => {
    const user = userEvent.setup();
    render(
      <div>
        <ExportMenu selectedCount={0} onExportCurrentView={vi.fn()} onExportAllFiltered={vi.fn()} onExportSelected={vi.fn()} onPrint={vi.fn()} />
        <button type="button">outside</button>
      </div>,
    );
    await user.click(screen.getByRole("button", { name: "Export" }));
    expect(screen.getByRole("menu")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "outside" }));
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });
});
