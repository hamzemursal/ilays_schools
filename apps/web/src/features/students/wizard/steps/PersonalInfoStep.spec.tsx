import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { emptyWizardState, type WizardState } from "../types";
import { PersonalInfoStep, isPersonalInfoValid } from "./PersonalInfoStep";

function renderStep(state: WizardState, onChange = vi.fn()) {
  const utils = render(<PersonalInfoStep state={state} onChange={onChange} />);
  return { onChange, ...utils };
}

beforeEach(() => {
  URL.createObjectURL = vi.fn(() => "blob:preview-url");
  URL.revokeObjectURL = vi.fn();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("PersonalInfoStep — fields", () => {
  // FormField appends a "*" marker inside the <label> for required fields,
  // so the label's accessible name is "First name*", not an exact match —
  // { exact: false } (substring match) is needed for every required field.
  it("reports first name changes", async () => {
    const user = userEvent.setup();
    const { onChange } = renderStep(emptyWizardState());
    await user.type(screen.getByLabelText("First name", { exact: false }), "H");
    expect(onChange).toHaveBeenCalledWith({ firstName: "H" });
  });

  it("reports last name changes", async () => {
    const user = userEvent.setup();
    const { onChange } = renderStep(emptyWizardState());
    await user.type(screen.getByLabelText("Last name", { exact: false }), "A");
    expect(onChange).toHaveBeenCalledWith({ lastName: "A" });
  });

  it("reports date of birth changes", () => {
    const { onChange } = renderStep(emptyWizardState());
    // fireEvent, not userEvent.type — jsdom's type="date" input doesn't
    // support segmented keystroke typing the way a real browser does.
    fireEvent.change(screen.getByLabelText("Date of birth", { exact: false }), { target: { value: "2015-05-01" } });
    expect(onChange).toHaveBeenCalledWith({ dateOfBirth: "2015-05-01" });
  });

  it("defaults sex to Male and reports a change to Female", async () => {
    const user = userEvent.setup();
    const { onChange } = renderStep(emptyWizardState());
    expect(screen.getByLabelText("Sex", { exact: false })).toHaveValue("MALE");
    await user.selectOptions(screen.getByLabelText("Sex", { exact: false }), "FEMALE");
    expect(onChange).toHaveBeenCalledWith({ sex: "FEMALE" });
  });

  it("reports the optional legacy student number", async () => {
    const user = userEvent.setup();
    const { onChange } = renderStep(emptyWizardState());
    // This field's label has no htmlFor (a pre-existing gap in the app,
    // not this test's to fix) — traverse from the label text instead.
    const input = screen.getByText("Prior / external student ID").closest("div")!.querySelector("input")!;
    await user.type(input, "9");
    expect(onChange).toHaveBeenCalledWith({ legacyStudentNumber: "9" });
  });
});

describe("PersonalInfoStep — photo", () => {
  it("shows a placeholder icon and 'Add a photo' when there's no preview yet", () => {
    renderStep(emptyWizardState());
    expect(screen.getByRole("button", { name: "Add a photo" })).toBeInTheDocument();
  });

  it("sets the photo file and a preview URL when a file is chosen", async () => {
    const user = userEvent.setup();
    const { onChange, container } = renderStep(emptyWizardState());
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(["bytes"], "photo.png", { type: "image/png" });
    await user.upload(input, file);
    expect(onChange).toHaveBeenCalledWith({ photoFile: file, photoPreviewUrl: "blob:preview-url" });
  });

  it("shows 'Replace photo' and the preview image once a photo is set", () => {
    const { container } = renderStep({ ...emptyWizardState(), photoPreviewUrl: "blob:existing" });
    expect(screen.getByRole("button", { name: "Replace photo" })).toBeInTheDocument();
    expect(container.querySelector("img")).toHaveAttribute("src", "blob:existing");
  });

  it("revokes the previous preview URL before assigning a new one", async () => {
    const user = userEvent.setup();
    const { container } = renderStep({ ...emptyWizardState(), photoPreviewUrl: "blob:old" });
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(input, new File(["bytes"], "new.png", { type: "image/png" }));
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:old");
  });
});

describe("isPersonalInfoValid", () => {
  it("is false when required fields are missing", () => {
    expect(isPersonalInfoValid(emptyWizardState())).toBe(false);
  });

  it("is false when a required field is only whitespace", () => {
    expect(
      isPersonalInfoValid({ ...emptyWizardState(), firstName: "  ", lastName: "Ali", dateOfBirth: "2015-01-01" }),
    ).toBe(false);
  });

  it("is true once first name, last name, and date of birth are all set", () => {
    expect(
      isPersonalInfoValid({ ...emptyWizardState(), firstName: "Hodan", lastName: "Ali", dateOfBirth: "2015-01-01" }),
    ).toBe(true);
  });
});
