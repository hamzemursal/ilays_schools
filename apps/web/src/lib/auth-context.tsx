"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { api, ApiError, setUnauthorizedHandler, type MfaChallenge, type Profile } from "./api";

interface AuthState {
  user: Profile | null;
  accessToken: string | null;
  loading: boolean;
  // Returns an MfaChallenge instead of a Profile when the account has 2FA
  // enabled — password alone was correct, but no session exists yet. The
  // caller (LoginForm) is responsible for collecting a code and calling
  // completeMfaLogin; auth state here stays untouched until that succeeds.
  login: (email: string, password: string) => Promise<Profile | MfaChallenge>;
  completeMfaLogin: (mfaToken: string, params: { code?: string; recoveryCode?: string }) => Promise<Profile>;
  logout: () => Promise<void>;
  acceptInvite: (token: string, password: string) => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

// The access token is deliberately short-lived (15m, see AuthService).
// Refreshing a few minutes ahead of expiry means normal use never actually
// hits a 401 in the first place — the reactive handler registered below is
// the fallback for whatever this timer doesn't catch (a laptop asleep past
// the margin, a clock skew, etc.), not the primary mechanism.
const PROACTIVE_REFRESH_INTERVAL_MS = 10 * 60 * 1000;

// Each login session gets its own refresh-token cookie, named by sessionId
// (see AuthController) — without this, a second tab logging into a
// different account would silently overwrite the first tab's cookie, and
// the first tab would eventually refresh into the second tab's identity.
//
// sessionStorage is genuinely per-tab (unlike localStorage or cookies), so
// it's where a tab remembers *its own* current session id across a same-tab
// reload. The localStorage mirror exists only so a brand-new tab with empty
// sessionStorage can make one best-effort attempt to resume "whatever was
// last active" — convenience for the ordinary single-session case — and is
// never consulted again once a tab has resolved its own session id.
const TAB_SESSION_KEY = "auth:sessionId";
const LAST_ACTIVE_SESSION_KEY = "auth:lastActiveSessionId";

function readInitialSessionId(): string | null {
  try {
    return window.sessionStorage.getItem(TAB_SESSION_KEY) ?? window.localStorage.getItem(LAST_ACTIVE_SESSION_KEY);
  } catch {
    return null;
  }
}

function persistSessionId(sessionId: string) {
  try {
    window.sessionStorage.setItem(TAB_SESSION_KEY, sessionId);
    window.localStorage.setItem(LAST_ACTIVE_SESSION_KEY, sessionId);
  } catch {
    // Private browsing / storage disabled — the session id just won't
    // survive a reload, same graceful degradation as before this change.
  }
}

function clearSessionId(sessionId: string | null) {
  try {
    window.sessionStorage.removeItem(TAB_SESSION_KEY);
    // Only un-seed the shared "last active" pointer if it still points at
    // the session being cleared — a different, still-live tab may since
    // have become the more relevant one to hand a brand-new tab.
    if (sessionId && window.localStorage.getItem(LAST_ACTIVE_SESSION_KEY) === sessionId) {
      window.localStorage.removeItem(LAST_ACTIVE_SESSION_KEY);
    }
  } catch {
    // ignore
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [user, setUser] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  // This tab's current login session id. A ref (not state) because nothing
  // needs to re-render when it changes — every read of it happens inside an
  // async callback right before an API call, never during render.
  const sessionIdRef = useRef<string | null>(null);

  const loadProfile = useCallback(async (token: string) => {
    const profile = await api.me(token);
    setUser(profile);
    return profile;
  }, []);

  // Concurrent 401s (e.g. a dashboard firing several requests at once right
  // as the token expires) must share one refresh, not each trigger their
  // own — the refresh token rotates on use, so a second call presented with
  // the now-revoked old cookie would read as theft and kill the session.
  const refreshPromiseRef = useRef<Promise<string | null> | null>(null);

  const performRefresh = useCallback((): Promise<string | null> => {
    if (refreshPromiseRef.current) return refreshPromiseRef.current;

    const p = (async () => {
      try {
        const { accessToken: token, sessionId } = await api.refresh(sessionIdRef.current ?? undefined);
        // Rotation issues a new sessionId every time — this tab must track
        // the latest one, or its next refresh would present a now-dead
        // cookie name and look like an expired session.
        sessionIdRef.current = sessionId;
        persistSessionId(sessionId);
        setAccessToken(token);
        await loadProfile(token);
        return token;
      } catch {
        // Refresh cookie is gone/expired/revoked — this session is truly
        // over. Clear state so the app's own "no user -> /login" redirect
        // takes it from here, instead of leaving a dead token around.
        clearSessionId(sessionIdRef.current);
        sessionIdRef.current = null;
        setAccessToken(null);
        setUser(null);
        return null;
      } finally {
        refreshPromiseRef.current = null;
      }
    })();

    refreshPromiseRef.current = p;
    return p;
  }, [loadProfile]);

  // On first load, there's no access token in memory yet — try the refresh
  // cookie silently to resume a session without asking for credentials again.
  // Guarded against firing twice (React's dev-mode double effect invocation
  // would otherwise send the same refresh token twice — since refresh tokens
  // rotate on use, the second call looks like a replay and revokes the
  // session that the first call just legitimately issued).
  const refreshedOnce = useRef(false);
  useEffect(() => {
    if (refreshedOnce.current) return;
    refreshedOnce.current = true;

    sessionIdRef.current = readInitialSessionId();
    performRefresh().finally(() => setLoading(false));
  }, [performRefresh]);

  // Lets the transport layer (api.ts) recover from an expired access token
  // by refreshing and retrying, instead of every page having to catch its
  // own "Invalid or expired access token" error.
  useEffect(() => {
    setUnauthorizedHandler(performRefresh);
    return () => setUnauthorizedHandler(null);
  }, [performRefresh]);

  // Proactive renewal — restarts every time the token actually changes, so
  // the interval tracks the real 15m window from whenever it was last
  // issued rather than an arbitrary wall-clock schedule.
  useEffect(() => {
    if (!accessToken) return;
    const id = setInterval(() => {
      performRefresh();
    }, PROACTIVE_REFRESH_INTERVAL_MS);
    return () => clearInterval(id);
  }, [accessToken, performRefresh]);

  const login = useCallback(
    async (email: string, password: string) => {
      const result = await api.login(email, password);
      if ("mfaRequired" in result) return result;
      sessionIdRef.current = result.sessionId;
      persistSessionId(result.sessionId);
      setAccessToken(result.accessToken);
      return loadProfile(result.accessToken);
    },
    [loadProfile],
  );

  const completeMfaLogin = useCallback(
    async (mfaToken: string, params: { code?: string; recoveryCode?: string }) => {
      const { accessToken: token, sessionId } = await api.verifyLoginTotp(mfaToken, params);
      sessionIdRef.current = sessionId;
      persistSessionId(sessionId);
      setAccessToken(token);
      return loadProfile(token);
    },
    [loadProfile],
  );

  const acceptInvite = useCallback(
    async (token: string, password: string) => {
      const { accessToken: newToken, sessionId } = await api.acceptInvite(token, password);
      sessionIdRef.current = sessionId;
      persistSessionId(sessionId);
      setAccessToken(newToken);
      await loadProfile(newToken);
    },
    [loadProfile],
  );

  const logout = useCallback(async () => {
    const sessionId = sessionIdRef.current;
    // Deliberately this tab's own session only: the cookie is named by
    // sessionId, so this clears exactly one login session server-side and
    // leaves every other tab/account's cookie (a different name) untouched.
    await api.logout(sessionId ?? undefined).catch(() => undefined);
    clearSessionId(sessionId);
    sessionIdRef.current = null;
    setAccessToken(null);
    setUser(null);
  }, []);

  // Re-fetches /auth/me against the current token — used after a password
  // change clears mustChangePassword, so the forced gate in AppShell lifts
  // without needing a full logout/login round trip.
  const refreshProfile = useCallback(async () => {
    if (!accessToken) return;
    await loadProfile(accessToken);
  }, [accessToken, loadProfile]);

  return (
    <AuthContext.Provider
      value={{ user, accessToken, loading, login, completeMfaLogin, logout, acceptInvite, refreshProfile }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

export { ApiError };
