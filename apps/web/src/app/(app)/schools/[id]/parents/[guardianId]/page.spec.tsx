import { Suspense } from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ParentDetail } from "@/lib/api";
import { ToastProvider } from "@/components/ui/Toast";
import ParentProfilePage from "./page";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => ({ get: () => null }),
}));
vi.mock("next/link", () => ({ default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a> }));

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
const authMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth-context", () => ({ useAuth: () => authMock(), ApiError }));

const apiMock = vi.hoisted(() => ({
  getParent: vi.fn(),
  createParentPortalAccount: vi.fn(),
  resetParentPortalPassword: vi.fn(),
  listStudents: vi.fn(),
  searchGuardians: vi.fn(),
}));
vi.mock("@/lib/api", () => ({ api: apiMock }));

function parent(overrides: Partial<ParentDetail> = {}): ParentDetail {
  return {
    id: "guardian-1",
    guardianCode: "PAR-00001",
    firstName: "Amina",
    lastName: "Ali",
    phone: null,
    email: "amina@example.test",
    address: null,
    status: "ACTIVE",
    user: { id: "user-1", email: "amina@example.test", status: "ACTIVE" },
    students: [],
    ...overrides,
  };
}

async function renderPage() {
  const params = Promise.resolve({ id: "school-1", guardianId: "guardian-1" });
  await act(async () => {
    render(
      <ToastProvider>
        <Suspense fallback={null}>
          <ParentProfilePage params={params} />
        </Suspense>
      </ToastProvider>,
    );
  });
  await screen.findByText("Amina Ali");
}

const MANAGER = { accessToken: "token", user: { permissions: ["guardians.manage", "guardians.view"], schools: [{ id: "school-1", name: "Saamalay" }] } };

beforeEach(() => {
  vi.clearAllMocks();
  authMock.mockReturnValue(MANAGER);
  apiMock.getParent.mockResolvedValue(parent());
});

describe("Parent profile — portal account actions", () => {
  it("a parent who already has a login gets 'Reset portal password' and NOT 'Create Portal Account'", async () => {
    await renderPage();

    expect(screen.getByText("Reset portal password")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Create Portal Account" })).not.toBeInTheDocument();
  });

  it("a parent with no login gets 'Create Portal Account' and NOT the reset card", async () => {
    apiMock.getParent.mockResolvedValue(parent({ user: null }));
    await renderPage();

    expect(screen.getByRole("button", { name: "Create Portal Account" })).toBeInTheDocument();
    expect(screen.queryByText("Reset portal password")).not.toBeInTheDocument();
  });

  it("without guardians.manage neither is offered", async () => {
    authMock.mockReturnValue({ accessToken: "token", user: { permissions: ["guardians.view"], schools: [] } });
    await renderPage();

    expect(screen.queryByText("Reset portal password")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Create Portal Account" })).not.toBeInTheDocument();
  });

  it("confirming the reset calls the RESET endpoint for this school and parent (never create) and shows the one-time password", async () => {
    const user = userEvent.setup();
    apiMock.resetParentPortalPassword.mockResolvedValue({ email: "amina@example.test", temporaryPassword: "Par-Temp-77" });
    await renderPage();

    await user.click(screen.getByRole("button", { name: "Reset password" }));
    await user.click(screen.getAllByRole("button", { name: "Reset password" }).at(-1)!);

    expect(await screen.findByText(/Par-Temp-77/)).toBeInTheDocument();
    expect(screen.getByText(/Login email: amina@example.test/)).toBeInTheDocument();
    expect(apiMock.resetParentPortalPassword).toHaveBeenCalledWith("token", "school-1", "guardian-1");
    expect(apiMock.createParentPortalAccount).not.toHaveBeenCalled();
  });
});
