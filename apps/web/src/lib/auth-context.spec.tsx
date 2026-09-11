import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { AuthProvider, useAuth } from "./auth-context";

vi.mock("./api", () => {
  const api = {
    refresh: vi.fn(),
    me: vi.fn(),
    login: vi.fn(),
    verifyLoginTotp: vi.fn(),
    acceptInvite: vi.fn(),
    logout: vi.fn(),
  };
  class ApiError extends Error {
    status: number;
    body?: unknown;
    constructor(message: string, status: number, body?: unknown) {
      super(message);
      this.status = status;
      this.body = body;
    }
  }
  return { api, ApiError, setUnauthorizedHandler: vi.fn() };
});

import { api, setUnauthorizedHandler } from "./api";

const PROFILE = {
  id: "user-1",
  email: "admin@example.com",
  organizationId: "org-1",
  roles: ["SCHOOL_ADMIN"],
  permissions: [],
  schoolIds: ["school-1"],
  schools: [],
  teacherId: null,
  guardianId: null,
  studentId: null,
  mustChangePassword: false,
  mustSetup2FA: false,
};

function wrapper({ children }: { children: ReactNode }) {
  return <AuthProvider>{children}</AuthProvider>;
}

async function renderAuth() {
  const view = renderHook(() => useAuth(), { wrapper });
  await waitFor(() => expect(view.result.current.loading).toBe(false));
  return view;
}

beforeEach(() => {
  vi.clearAllMocks();
  window.sessionStorage.clear();
  window.localStorage.clear();
  (api.refresh as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("no session"));
});

describe("AuthProvider — initial silent refresh", () => {
  it("attempts a silent refresh on mount and settles loading to false even when it fails", async () => {
    const { result } = await renderAuth();
    expect(result.current.user).toBeNull();
    expect(result.current.accessToken).toBeNull();
  });

  it("resumes a session and loads the profile when the silent refresh succeeds", async () => {
    (api.refresh as ReturnType<typeof vi.fn>).mockResolvedValue({ accessToken: "tok-1", sessionId: "sess-1" });
    (api.me as ReturnType<typeof vi.fn>).mockResolvedValue(PROFILE);

    const { result } = await renderAuth();

    expect(result.current.accessToken).toBe("tok-1");
    expect(result.current.user).toEqual(PROFILE);
  });

  it("persists the new sessionId to both sessionStorage (this tab) and localStorage (last-active pointer)", async () => {
    (api.refresh as ReturnType<typeof vi.fn>).mockResolvedValue({ accessToken: "tok-1", sessionId: "sess-1" });
    (api.me as ReturnType<typeof vi.fn>).mockResolvedValue(PROFILE);

    await renderAuth();

    expect(window.sessionStorage.getItem("auth:sessionId")).toBe("sess-1");
    expect(window.localStorage.getItem("auth:lastActiveSessionId")).toBe("sess-1");
  });

  it("prefers this tab's own sessionStorage session id over localStorage's shared pointer", async () => {
    window.sessionStorage.setItem("auth:sessionId", "this-tab-session");
    window.localStorage.setItem("auth:lastActiveSessionId", "some-other-session");
    (api.refresh as ReturnType<typeof vi.fn>).mockResolvedValue({ accessToken: "tok-1", sessionId: "sess-1" });
    (api.me as ReturnType<typeof vi.fn>).mockResolvedValue(PROFILE);

    await renderAuth();

    expect(api.refresh).toHaveBeenCalledWith("this-tab-session");
  });

  it("falls back to localStorage's last-active session id for a brand-new tab with empty sessionStorage", async () => {
    window.localStorage.setItem("auth:lastActiveSessionId", "last-active-session");
    (api.refresh as ReturnType<typeof vi.fn>).mockResolvedValue({ accessToken: "tok-1", sessionId: "sess-1" });
    (api.me as ReturnType<typeof vi.fn>).mockResolvedValue(PROFILE);

    await renderAuth();

    expect(api.refresh).toHaveBeenCalledWith("last-active-session");
  });
});

describe("AuthProvider.login", () => {
  it("sets accessToken and loads the profile on a normal (non-MFA) login", async () => {
    (api.login as ReturnType<typeof vi.fn>).mockResolvedValue({ accessToken: "tok-2", sessionId: "sess-2" });
    (api.me as ReturnType<typeof vi.fn>).mockResolvedValue(PROFILE);
    const { result } = await renderAuth();

    await result.current.login("admin@example.com", "correct-password");

    await waitFor(() => expect(result.current.user).toEqual(PROFILE));
    expect(result.current.accessToken).toBe("tok-2");
  });

  it("returns the MFA challenge untouched, leaving accessToken/user unset, when 2FA is required", async () => {
    (api.login as ReturnType<typeof vi.fn>).mockResolvedValue({ mfaRequired: true, mfaToken: "mfa-tok" });
    const { result } = await renderAuth();

    const outcome = await result.current.login("admin@example.com", "correct-password");

    expect(outcome).toEqual({ mfaRequired: true, mfaToken: "mfa-tok" });
    expect(result.current.accessToken).toBeNull();
    expect(result.current.user).toBeNull();
    expect(api.me).not.toHaveBeenCalled();
  });
});

describe("AuthProvider.completeMfaLogin", () => {
  it("sets accessToken and loads the profile once the TOTP code is verified", async () => {
    (api.verifyLoginTotp as ReturnType<typeof vi.fn>).mockResolvedValue({ accessToken: "tok-3", sessionId: "sess-3" });
    (api.me as ReturnType<typeof vi.fn>).mockResolvedValue(PROFILE);
    const { result } = await renderAuth();

    await result.current.completeMfaLogin("mfa-tok", { code: "123456" });

    await waitFor(() => expect(result.current.user).toEqual(PROFILE));
    expect(result.current.accessToken).toBe("tok-3");
  });
});

describe("AuthProvider.logout", () => {
  it("calls api.logout with this tab's own current sessionId", async () => {
    (api.login as ReturnType<typeof vi.fn>).mockResolvedValue({ accessToken: "tok-4", sessionId: "sess-4" });
    (api.me as ReturnType<typeof vi.fn>).mockResolvedValue(PROFILE);
    (api.logout as ReturnType<typeof vi.fn>).mockResolvedValue({ success: true });
    const { result } = await renderAuth();
    await result.current.login("admin@example.com", "correct-password");
    await waitFor(() => expect(result.current.user).toEqual(PROFILE));

    await result.current.logout();

    expect(api.logout).toHaveBeenCalledWith("sess-4");
  });

  it("clears accessToken/user and this tab's sessionStorage even when the server-side logout call fails", async () => {
    (api.login as ReturnType<typeof vi.fn>).mockResolvedValue({ accessToken: "tok-5", sessionId: "sess-5" });
    (api.me as ReturnType<typeof vi.fn>).mockResolvedValue(PROFILE);
    (api.logout as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("network down"));
    const { result } = await renderAuth();
    await result.current.login("admin@example.com", "correct-password");
    await waitFor(() => expect(result.current.user).toEqual(PROFILE));

    await result.current.logout();

    await waitFor(() => expect(result.current.accessToken).toBeNull());
    expect(result.current.user).toBeNull();
    expect(window.sessionStorage.getItem("auth:sessionId")).toBeNull();
  });
});

describe("AuthProvider — concurrent-refresh dedup via the registered unauthorized handler", () => {
  it("shares one in-flight refresh across simultaneous 401s instead of issuing a second refresh call", async () => {
    (api.refresh as ReturnType<typeof vi.fn>).mockResolvedValue({ accessToken: "tok-6", sessionId: "sess-6" });
    (api.me as ReturnType<typeof vi.fn>).mockResolvedValue(PROFILE);
    await renderAuth();

    const registeredHandler = (setUnauthorizedHandler as ReturnType<typeof vi.fn>).mock.calls.at(-1)?.[0] as () => Promise<string | null>;
    expect(registeredHandler).toBeInstanceOf(Function);

    (api.refresh as ReturnType<typeof vi.fn>).mockClear();
    (api.refresh as ReturnType<typeof vi.fn>).mockResolvedValue({ accessToken: "tok-7", sessionId: "sess-7" });

    const [first, second] = await Promise.all([registeredHandler(), registeredHandler()]);

    expect(api.refresh).toHaveBeenCalledTimes(1);
    expect(first).toBe("tok-7");
    expect(second).toBe("tok-7");
  });
});

describe("AuthProvider.refreshProfile", () => {
  it("is a no-op when there is no access token yet", async () => {
    const { result } = await renderAuth();
    await result.current.refreshProfile();
    expect(api.me).not.toHaveBeenCalled();
  });

  it("re-fetches the profile using the current access token when one exists", async () => {
    (api.login as ReturnType<typeof vi.fn>).mockResolvedValue({ accessToken: "tok-8", sessionId: "sess-8" });
    (api.me as ReturnType<typeof vi.fn>).mockResolvedValue(PROFILE);
    const { result } = await renderAuth();
    await result.current.login("admin@example.com", "correct-password");
    await waitFor(() => expect(result.current.user).toEqual(PROFILE));
    (api.me as ReturnType<typeof vi.fn>).mockClear();

    const updatedProfile = { ...PROFILE, mustChangePassword: false };
    (api.me as ReturnType<typeof vi.fn>).mockResolvedValue(updatedProfile);
    await result.current.refreshProfile();

    expect(api.me).toHaveBeenCalledWith("tok-8");
  });
});
