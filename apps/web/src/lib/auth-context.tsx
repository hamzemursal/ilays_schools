"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { api, ApiError, setUnauthorizedHandler, type Profile } from "./api";

interface AuthState {
  user: Profile | null;
  accessToken: string | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<Profile>;
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

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [user, setUser] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

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
        const { accessToken: token } = await api.refresh();
        setAccessToken(token);
        await loadProfile(token);
        return token;
      } catch {
        // Refresh cookie is gone/expired/revoked — this session is truly
        // over. Clear state so the app's own "no user -> /login" redirect
        // takes it from here, instead of leaving a dead token around.
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
      const { accessToken: token } = await api.login(email, password);
      setAccessToken(token);
      return loadProfile(token);
    },
    [loadProfile],
  );

  const acceptInvite = useCallback(
    async (token: string, password: string) => {
      const { accessToken: newToken } = await api.acceptInvite(token, password);
      setAccessToken(newToken);
      await loadProfile(newToken);
    },
    [loadProfile],
  );

  const logout = useCallback(async () => {
    await api.logout().catch(() => undefined);
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
    <AuthContext.Provider value={{ user, accessToken, loading, login, logout, acceptInvite, refreshProfile }}>
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
