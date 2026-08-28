"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { api, ApiError, type Profile } from "./api";

interface AuthState {
  user: Profile | null;
  accessToken: string | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  acceptInvite: (token: string, password: string) => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [user, setUser] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const loadProfile = useCallback(async (token: string) => {
    const profile = await api.me(token);
    setUser(profile);
  }, []);

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

    (async () => {
      try {
        const { accessToken: token } = await api.refresh();
        setAccessToken(token);
        await loadProfile(token);
      } catch {
        // No valid session — that's fine, user just isn't logged in.
      } finally {
        setLoading(false);
      }
    })();
  }, [loadProfile]);

  const login = useCallback(
    async (email: string, password: string) => {
      const { accessToken: token } = await api.login(email, password);
      setAccessToken(token);
      await loadProfile(token);
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

  return (
    <AuthContext.Provider value={{ user, accessToken, loading, login, logout, acceptInvite }}>
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
