"use client";

import { useEffect, useState } from "react";
import { useAuth, ApiError } from "@/lib/auth-context";
import { api, type MyStudentProfile } from "@/lib/api";

// Shared identity fetch for the Student Portal's Dashboard/Profile/Academics
// pages — every field comes from GET /students/me, which itself enforces
// the SECONDARY-division gate server-side (see StudentPortalService). A 403
// here means exactly what the backend says: this account currently has no
// portal access, whatever the reason (no active enrollment, no longer
// secondary, etc.) — surfaced as-is rather than guessed at.
export function useStudentProfile() {
  const { accessToken } = useAuth();
  const [profile, setProfile] = useState<MyStudentProfile | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken) return;
    api
      .getMyStudentProfile(accessToken)
      .then(setProfile)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load your profile"));
  }, [accessToken]);

  return { profile, error, loading: !profile && !error };
}
