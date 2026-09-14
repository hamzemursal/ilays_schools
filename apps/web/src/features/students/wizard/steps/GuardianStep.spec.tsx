import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { GuardianSearchResult } from "@/lib/api";
import { emptyWizardState, type WizardGuardian, type WizardState } from "../types";
import { GuardianStep } from "./GuardianStep";

const authMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth-context", () => ({ useAuth: () => authMock() }));

const apiMock = vi.hoisted(() => ({ searchGuardians: vi.fn() }));
vi.mock("@/lib/api", () => ({ api: apiMock }));

function guardian(overrides: Partial<WizardGuardian> = {}): WizardGuardian {
  return {
    key: "g-1",
    mode: "existing",
    guardianId: "guardian-1",
    firstName: "Amina",
    lastName: "Ali",
    phone: "0611111111",
    email: "",
    relationship: "MOTHER",
    isPrimaryContact: true,
    ...overrides,
  };
}

function renderStep(state: WizardState = emptyWizardState(), onChange = vi.fn()) {
  const utils = render(<GuardianStep schoolId="school-1" state={state} onChange={onChange} />);
  return { onChange, ...utils };
}

beforeEach(() => {
  vi.clearAllMocks();
  authMock.mockReturnValue({ accessToken: "token-1" });
});

afterEach(() => {
  // Safety net: a failed assertion inside a fake-timers test would otherwise
  // skip its own vi.useRealTimers() cleanup and hang every later test in
  // this file (userEvent's internal delays rely on real timers).
  vi.useRealTimers();
});

describe("GuardianStep — list", () => {
  it("shows an empty state when there are no guardians", () => {
    renderStep();
    expect(screen.getByText("No guardians added yet")).toBeInTheDocument();
  });

  it("lists an added guardian with relationship, mode, and primary badges", () => {
    renderStep({ ...emptyWizardState(), guardians: [guardian()] });
    expect(screen.getByText("Amina Ali")).toBeInTheDocument();
    expect(screen.getByText("Mother · 0611111111")).toBeInTheDocument();
    expect(screen.getByText("Existing guardian")).toBeInTheDocument();
    expect(screen.getByText("Primary")).toBeInTheDocument();
  });

  it("labels a manually-created guardian as New guardian, with no Primary badge", () => {
    renderStep({ ...emptyWizardState(), guardians: [guardian({ mode: "new", isPrimaryContact: false })] });
    expect(screen.getByText("New guardian")).toBeInTheDocument();
    expect(screen.queryByText("Primary")).not.toBeInTheDocument();
  });

  it("removes a guardian when its trash button is clicked", async () => {
    const user = userEvent.setup();
    const { onChange } = renderStep({ ...emptyWizardState(), guardians: [guardian()] });
    await user.click(screen.getByRole("button", { name: "Remove guardian" }));
    expect(onChange).toHaveBeenCalledWith({ guardians: [] });
  });
});

describe("GuardianStep — search existing", () => {
  // These type into the search box via fireEvent (synchronous, no internal
  // setTimeout) rather than userEvent.type — combining userEvent's own
  // internal delays with fake timers deadlocks the test. Clicks still use
  // real userEvent, under real timers, before/after the fake-timers window.
  it("does not search until at least 2 characters are typed", async () => {
    const user = userEvent.setup();
    renderStep();
    await user.click(screen.getByRole("button", { name: "Add guardian" }));
    const input = screen.getByPlaceholderText("Search by name, phone, or email…");

    vi.useFakeTimers();
    fireEvent.change(input, { target: { value: "a" } });
    await vi.advanceTimersByTimeAsync(500);
    expect(apiMock.searchGuardians).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it("searches after a debounce once 2+ characters are typed", async () => {
    const user = userEvent.setup();
    apiMock.searchGuardians.mockResolvedValue([]);
    renderStep();
    await user.click(screen.getByRole("button", { name: "Add guardian" }));
    const input = screen.getByPlaceholderText("Search by name, phone, or email…");

    vi.useFakeTimers();
    fireEvent.change(input, { target: { value: "am" } });
    await vi.advanceTimersByTimeAsync(500);
    expect(apiMock.searchGuardians).toHaveBeenCalledWith("token-1", "school-1", "am");
    vi.useRealTimers();
  });

  it("shows a no-match message when the search returns nothing", async () => {
    const user = userEvent.setup();
    apiMock.searchGuardians.mockResolvedValue([]);
    renderStep();
    await user.click(screen.getByRole("button", { name: "Add guardian" }));
    const input = screen.getByPlaceholderText("Search by name, phone, or email…");

    vi.useFakeTimers();
    fireEvent.change(input, { target: { value: "zz" } });
    await vi.advanceTimersByTimeAsync(500);
    vi.useRealTimers();
    expect(await screen.findByText(/No matching guardian in this school/)).toBeInTheDocument();
  });

  it("lets an admin pick a result, set relationship and primary contact, and add it", async () => {
    const user = userEvent.setup();
    const result: GuardianSearchResult = {
      id: "guardian-9",
      firstName: "Ifrah",
      lastName: "Warsame",
      phone: "0699999999",
      email: null,
      linkedStudentCount: 1,
    };
    apiMock.searchGuardians.mockResolvedValue([result]);
    const { onChange } = renderStep();
    await user.click(screen.getByRole("button", { name: "Add guardian" }));
    const input = screen.getByPlaceholderText("Search by name, phone, or email…");

    vi.useFakeTimers();
    fireEvent.change(input, { target: { value: "ifrah" } });
    await vi.advanceTimersByTimeAsync(500);
    vi.useRealTimers();
    await user.click(await screen.findByRole("button", { name: /Ifrah Warsame/ }));

    await user.selectOptions(screen.getByRole("combobox"), "MOTHER");
    await user.click(screen.getByRole("checkbox", { name: "Primary contact" }));
    await user.click(screen.getByRole("button", { name: "Add Ifrah" }));

    expect(onChange).toHaveBeenCalledWith({
      guardians: [
        expect.objectContaining({
          mode: "existing",
          guardianId: "guardian-9",
          firstName: "Ifrah",
          lastName: "Warsame",
          phone: "0699999999",
          email: "",
          relationship: "MOTHER",
          isPrimaryContact: true,
        }),
      ],
    });
    vi.useRealTimers();
  });
});

describe("GuardianStep — create new", () => {
  it("disables Add guardian until first and last name are filled", async () => {
    const user = userEvent.setup();
    renderStep();
    await user.click(screen.getByRole("button", { name: "Add guardian" }));
    await user.click(screen.getByRole("button", { name: "Create new" }));
    expect(screen.getByRole("button", { name: "Add guardian" })).toBeDisabled();
  });

  it("adds a new guardian once required fields are filled", async () => {
    const user = userEvent.setup();
    const { onChange } = renderStep();
    await user.click(screen.getByRole("button", { name: "Add guardian" }));
    await user.click(screen.getByRole("button", { name: "Create new" }));
    // GuardianFieldSet's labels have no htmlFor (a pre-existing gap in the
    // app, not this test's to fix) — target by DOM order instead.
    const [firstName, lastName] = screen.getAllByRole("textbox");
    await user.type(firstName, "Yusuf");
    await user.type(lastName, "Warsame");
    await user.click(screen.getByRole("button", { name: "Add guardian" }));

    expect(onChange).toHaveBeenCalledWith({
      guardians: [
        expect.objectContaining({
          mode: "new",
          firstName: "Yusuf",
          lastName: "Warsame",
          relationship: "FATHER",
          isPrimaryContact: false,
        }),
      ],
    });
  });

  it("cancels back to the empty state", async () => {
    const user = userEvent.setup();
    renderStep();
    await user.click(screen.getByRole("button", { name: "Add guardian" }));
    await user.click(screen.getByRole("button", { name: "Create new" }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByText("No guardians added yet")).toBeInTheDocument();
  });
});
