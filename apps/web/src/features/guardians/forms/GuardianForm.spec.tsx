import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { GuardianRecord, GuardianSearchResult } from "@/lib/api";
import { GuardianForm } from "./GuardianForm";

const apiMock = vi.hoisted(() => ({ searchGuardians: vi.fn(), addGuardian: vi.fn() }));
vi.mock("@/lib/api", () => ({ api: apiMock }));

const { ApiError } = vi.hoisted(() => {
  class ApiError extends Error {
    status: number;
    constructor(message: string, status = 400) {
      super(message);
      this.status = status;
    }
  }
  return { ApiError };
});
vi.mock("@/lib/auth-context", () => ({ ApiError }));

function searchResult(overrides: Partial<GuardianSearchResult> = {}): GuardianSearchResult {
  return { id: "guardian-1", firstName: "Ahmed", lastName: "Hassan", phone: "0611111111", email: null, linkedStudentCount: 2, ...overrides };
}

function renderForm(overrides: Partial<React.ComponentProps<typeof GuardianForm>> = {}) {
  const onAdded = vi.fn();
  const onCancel = vi.fn();
  const utils = render(
    <GuardianForm accessToken="token-1" schoolId="school-1" studentId="student-1" onAdded={onAdded} onCancel={onCancel} {...overrides} />,
  );
  return { onAdded, onCancel, ...utils };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GuardianForm — search existing parent first", () => {
  it("shows the search box by default, not the create form", () => {
    renderForm();
    expect(screen.getByPlaceholderText("Search parent by name, phone, or email…")).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: /first name/i })).not.toBeInTheDocument();
  });

  it("does not search until at least 2 characters are typed (debounced)", async () => {
    vi.useFakeTimers();
    const user = userEvent.setup({ delay: null });
    renderForm();
    fireEvent.change(screen.getByPlaceholderText("Search parent by name, phone, or email…"), { target: { value: "A" } });
    await vi.advanceTimersByTimeAsync(500);
    expect(apiMock.searchGuardians).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it("searches by name and shows a result with its linked-student count", async () => {
    vi.useFakeTimers();
    apiMock.searchGuardians.mockResolvedValue([searchResult()]);
    renderForm();
    fireEvent.change(screen.getByPlaceholderText("Search parent by name, phone, or email…"), { target: { value: "Ahmed" } });
    await vi.advanceTimersByTimeAsync(500);
    vi.useRealTimers();

    expect(apiMock.searchGuardians).toHaveBeenCalledWith("token-1", "school-1", "Ahmed");
    expect(await screen.findByText("Ahmed Hassan")).toBeInTheDocument();
    expect(screen.getByText("Already linked to 2 students")).toBeInTheDocument();
  });

  it("uses singular wording for exactly one linked student", async () => {
    vi.useFakeTimers();
    apiMock.searchGuardians.mockResolvedValue([searchResult({ linkedStudentCount: 1 })]);
    renderForm();
    fireEvent.change(screen.getByPlaceholderText("Search parent by name, phone, or email…"), { target: { value: "Ahmed" } });
    await vi.advanceTimersByTimeAsync(500);
    vi.useRealTimers();

    expect(await screen.findByText("Already linked to 1 student")).toBeInTheDocument();
  });

  it("passes a phone-number query straight through to the search endpoint", async () => {
    vi.useFakeTimers();
    apiMock.searchGuardians.mockResolvedValue([searchResult()]);
    renderForm();
    fireEvent.change(screen.getByPlaceholderText("Search parent by name, phone, or email…"), { target: { value: "0611111111" } });
    await vi.advanceTimersByTimeAsync(500);
    vi.useRealTimers();

    expect(apiMock.searchGuardians).toHaveBeenCalledWith("token-1", "school-1", "0611111111");
  });

  it("passes an email query straight through to the search endpoint", async () => {
    vi.useFakeTimers();
    apiMock.searchGuardians.mockResolvedValue([searchResult({ email: "ahmed@example.com" })]);
    renderForm();
    fireEvent.change(screen.getByPlaceholderText("Search parent by name, phone, or email…"), {
      target: { value: "ahmed@example.com" },
    });
    await vi.advanceTimersByTimeAsync(500);
    vi.useRealTimers();

    expect(apiMock.searchGuardians).toHaveBeenCalledWith("token-1", "school-1", "ahmed@example.com");
  });

  it("shows 'No existing parent found' with a Create New Parent action when nothing matches", async () => {
    vi.useFakeTimers();
    apiMock.searchGuardians.mockResolvedValue([]);
    renderForm();
    fireEvent.change(screen.getByPlaceholderText("Search parent by name, phone, or email…"), { target: { value: "Nobody" } });
    await vi.advanceTimersByTimeAsync(500);
    vi.useRealTimers();

    expect(await screen.findByText("No existing parent found.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create New Parent" })).toBeInTheDocument();
  });
});

describe("GuardianForm — selecting an existing parent links, never creates a duplicate", () => {
  it("selecting a result shows the relationship/primary-contact confirmation, then links via existingGuardianId", async () => {
    vi.useFakeTimers();
    const user = userEvent.setup({ delay: null });
    apiMock.searchGuardians.mockResolvedValue([searchResult()]);
    apiMock.addGuardian.mockResolvedValue({
      id: "guardian-1",
      firstName: "Ahmed",
      lastName: "Hassan",
      phone: "0611111111",
      email: null,
      relationship: "FATHER",
      isPrimaryContact: true,
    } satisfies GuardianRecord);
    const { onAdded } = renderForm();

    fireEvent.change(screen.getByPlaceholderText("Search parent by name, phone, or email…"), { target: { value: "Ahmed" } });
    await vi.advanceTimersByTimeAsync(500);
    vi.useRealTimers();

    await user.click(await screen.findByRole("button", { name: "Select Parent" }));
    expect(screen.getByText("Link Ahmed to this student")).toBeInTheDocument();

    await user.selectOptions(screen.getByRole("combobox", { name: "Relationship" }), "FATHER");
    await user.click(screen.getByRole("checkbox", { name: "Primary contact" }));
    await user.click(screen.getByRole("button", { name: "Save / Link Parent" }));

    expect(apiMock.addGuardian).toHaveBeenCalledWith("token-1", "student-1", {
      existingGuardianId: "guardian-1",
      firstName: "Ahmed",
      lastName: "Hassan",
      phone: "0611111111",
      email: undefined,
      relationship: "FATHER",
      isPrimaryContact: true,
    });
    expect(onAdded).toHaveBeenCalled();
  });

  it("never calls addGuardian without existingGuardianId once a result is selected", async () => {
    vi.useFakeTimers();
    const user = userEvent.setup({ delay: null });
    apiMock.searchGuardians.mockResolvedValue([searchResult()]);
    apiMock.addGuardian.mockResolvedValue({} as GuardianRecord);
    renderForm();

    fireEvent.change(screen.getByPlaceholderText("Search parent by name, phone, or email…"), { target: { value: "Ahmed" } });
    await vi.advanceTimersByTimeAsync(500);
    vi.useRealTimers();

    await user.click(await screen.findByRole("button", { name: "Select Parent" }));
    await user.click(screen.getByRole("button", { name: "Save / Link Parent" }));

    expect(apiMock.addGuardian.mock.calls[0][2].existingGuardianId).toBe("guardian-1");
  });

  it("can go back to search from the confirmation step without submitting", async () => {
    vi.useFakeTimers();
    const user = userEvent.setup({ delay: null });
    apiMock.searchGuardians.mockResolvedValue([searchResult()]);
    renderForm();

    fireEvent.change(screen.getByPlaceholderText("Search parent by name, phone, or email…"), { target: { value: "Ahmed" } });
    await vi.advanceTimersByTimeAsync(500);
    vi.useRealTimers();

    await user.click(await screen.findByRole("button", { name: "Select Parent" }));
    await user.click(screen.getByRole("button", { name: "Back to search" }));

    expect(screen.getByPlaceholderText("Search parent by name, phone, or email…")).toBeInTheDocument();
    expect(apiMock.addGuardian).not.toHaveBeenCalled();
  });
});

describe("GuardianForm — create new parent fallback", () => {
  it("switches to the create-new form from the empty-results state", async () => {
    vi.useFakeTimers();
    const user = userEvent.setup({ delay: null });
    apiMock.searchGuardians.mockResolvedValue([]);
    renderForm();

    fireEvent.change(screen.getByPlaceholderText("Search parent by name, phone, or email…"), { target: { value: "Nobody" } });
    await vi.advanceTimersByTimeAsync(500);
    vi.useRealTimers();

    await user.click(await screen.findByRole("button", { name: "Create New Parent" }));
    expect(screen.getByText("First name")).toBeInTheDocument();
  });

  it("switches to the create-new form directly, without requiring a search first", async () => {
    const user = userEvent.setup();
    renderForm();
    await user.click(screen.getByRole("button", { name: "Create a new parent instead" }));
    expect(screen.getByText("First name")).toBeInTheDocument();
  });

  it("submits the create-new form with no existingGuardianId, so the backend's own findOrCreate resolves it", async () => {
    const user = userEvent.setup();
    apiMock.addGuardian.mockResolvedValue({
      id: "guardian-new",
      firstName: "Yusuf",
      lastName: "Warsame",
      phone: null,
      email: null,
      relationship: "FATHER",
      isPrimaryContact: false,
    } satisfies GuardianRecord);
    const { onAdded } = renderForm();

    await user.click(screen.getByRole("button", { name: "Create a new parent instead" }));
    // GuardianFieldSet's labels have no htmlFor — target by DOM order,
    // matching the same known gap already documented in GuardianStep.spec.
    const [firstName, lastName] = screen.getAllByRole("textbox");
    await user.type(firstName, "Yusuf");
    await user.type(lastName, "Warsame");
    await user.click(screen.getByRole("button", { name: "Add guardian" }));

    expect(apiMock.addGuardian).toHaveBeenCalledWith(
      "token-1",
      "student-1",
      expect.objectContaining({ firstName: "Yusuf", lastName: "Warsame" }),
    );
    expect(apiMock.addGuardian.mock.calls[0][2].existingGuardianId).toBeUndefined();
    expect(onAdded).toHaveBeenCalled();
  });

  it("shows an error and does not call onAdded when the API call fails", async () => {
    const user = userEvent.setup();
    apiMock.addGuardian.mockRejectedValue(new ApiError("Something went wrong"));
    const { onAdded } = renderForm();

    await user.click(screen.getByRole("button", { name: "Create a new parent instead" }));
    const [firstName, lastName] = screen.getAllByRole("textbox");
    await user.type(firstName, "Yusuf");
    await user.type(lastName, "Warsame");
    await user.click(screen.getByRole("button", { name: "Add guardian" }));

    expect(await screen.findByText("Something went wrong")).toBeInTheDocument();
    expect(onAdded).not.toHaveBeenCalled();
  });
});

describe("GuardianForm — cancel", () => {
  it("calls onCancel from the search step", async () => {
    const user = userEvent.setup();
    const { onCancel } = renderForm();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalled();
  });
});

describe("GuardianForm — a student has at most one Mother and one Father", () => {
  const existing = (relationship: GuardianRecord["relationship"], firstName: string): GuardianRecord => ({
    id: `g-${firstName}`, firstName, lastName: "Ali", phone: null, email: null, relationship, isPrimaryContact: false,
  });

  async function openLinkStep(existingGuardians: GuardianRecord[]) {
    vi.useFakeTimers();
    apiMock.searchGuardians.mockResolvedValue([searchResult()]);
    renderForm({ existingGuardians });
    fireEvent.change(screen.getByPlaceholderText("Search parent by name, phone, or email…"), { target: { value: "Ahmed" } });
    await vi.advanceTimersByTimeAsync(500);
    vi.useRealTimers();
    await userEvent.setup().click(await screen.findByRole("button", { name: "Select Parent" }));
  }

  it("with a Mother already linked, Mother is disabled (naming her) and the default moves to Father", async () => {
    await openLinkStep([existing("MOTHER", "Amina")]);

    const select = screen.getByLabelText("Relationship") as HTMLSelectElement;
    expect(screen.getByRole("option", { name: "Mother — already assigned to Amina Ali" })).toBeDisabled();
    expect(select.value).toBe("FATHER");
  });

  it("with both parents linked, only Guardian / Other relative remain, defaulting to Guardian", async () => {
    await openLinkStep([existing("MOTHER", "Amina"), existing("FATHER", "Hassan")]);

    expect(screen.getByRole("option", { name: /Mother — already assigned/ })).toBeDisabled();
    expect(screen.getByRole("option", { name: /Father — already assigned/ })).toBeDisabled();
    expect((screen.getByLabelText("Relationship") as HTMLSelectElement).value).toBe("GUARDIAN");
    expect(screen.getByRole("option", { name: "Other relative" })).toBeEnabled();
  });

  it("a Guardian or Other relative never blocks anything (any number allowed)", async () => {
    await openLinkStep([existing("GUARDIAN", "Ahmed"), existing("OTHER", "Uncle"), existing("OTHER", "Aunt")]);

    expect(screen.getByRole("option", { name: "Mother" })).toBeEnabled();
    expect(screen.getByRole("option", { name: "Father" })).toBeEnabled();
  });

  it("shows the server's refusal clearly if a second Mother still gets through to the API", async () => {
    const user = userEvent.setup();
    apiMock.addGuardian.mockRejectedValue(new ApiError("This student already has a Mother (Amina Ali). A student can have only one Mother; use Guardian or Other for additional relatives.", 409));
    await openLinkStep([]);

    await user.selectOptions(screen.getByLabelText("Relationship"), "MOTHER");
    await user.click(screen.getByRole("button", { name: "Save / Link Parent" }));

    expect(await screen.findByText(/already has a Mother \(Amina Ali\)/)).toBeInTheDocument();
  });
});
