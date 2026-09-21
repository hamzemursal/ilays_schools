import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ToastProvider } from "@/components/ui/Toast";
import { ResetPortalPasswordCard, type ResetResult } from "./ResetPortalPasswordCard";

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

const RESULT: ResetResult = { loginLabel: "Login email", loginValue: "amina@example.test", temporaryPassword: "Tmp-abc123" };

function renderCard(onReset = vi.fn().mockResolvedValue(RESULT)) {
  render(
    <ToastProvider>
      <ResetPortalPasswordCard personName="Amina Ali" onReset={onReset} />
    </ToastProvider>,
  );
  return onReset;
}

describe("ResetPortalPasswordCard", () => {
  it("says it resets the existing login and does not create another account", () => {
    renderCard();

    expect(screen.getByText(/does not create another account/)).toBeInTheDocument();
  });

  it("does nothing until the admin confirms; Cancel keeps the password as it was", async () => {
    const user = userEvent.setup();
    const onReset = renderCard();

    await user.click(screen.getByRole("button", { name: "Reset password" }));
    expect(screen.getByText("Reset Amina Ali's portal password?")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(onReset).not.toHaveBeenCalled();
    expect(screen.queryByText(/Temporary password/)).not.toBeInTheDocument();
  });

  it("after confirming, shows the login and the one-time temporary password with the must-change notice", async () => {
    const user = userEvent.setup();
    const onReset = renderCard();

    await user.click(screen.getByRole("button", { name: "Reset password" }));
    await user.click(screen.getAllByRole("button", { name: "Reset password" }).at(-1)!);

    expect(await screen.findByText(/Tmp-abc123/)).toBeInTheDocument();
    expect(screen.getByText(/amina@example.test/)).toBeInTheDocument();
    expect(screen.getByText(/choose their own password on next login/)).toBeInTheDocument();
    expect(onReset).toHaveBeenCalledTimes(1);
  });

  it("shows the server's error and no password when the reset fails", async () => {
    const user = userEvent.setup();
    renderCard(vi.fn().mockRejectedValue(new ApiError("This parent has no portal account yet - create one first")));

    await user.click(screen.getByRole("button", { name: "Reset password" }));
    await user.click(screen.getAllByRole("button", { name: "Reset password" }).at(-1)!);

    expect(await screen.findByText(/no portal account yet/)).toBeInTheDocument();
    expect(screen.queryByText(/Temporary password/)).not.toBeInTheDocument();
  });
});
