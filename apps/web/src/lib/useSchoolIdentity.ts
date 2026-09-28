"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";

export interface SchoolIdentity {
  id: string;
  name: string;
  address: string | null;
}

// The selected school's own name and address, from the existing school
// resolver (GET /schools/by-identifier/:id — scoped to schools the actor can
// already access, and available to a School Admin, who can't call the
// org-level GET /schools/:id). Only asked for when the actor can view the
// academic structure (that endpoint's permission); otherwise null, and the
// caller falls back to the name it already has. Never hard-coded.
export function useSchoolIdentity(accessToken: string | null, schoolId: string | null, canView: boolean): SchoolIdentity | null {
  const [loaded, setLoaded] = useState<SchoolIdentity | null>(null);

  useEffect(() => {
    if (!accessToken || !schoolId || !canView) return;
    let cancelled = false;
    api
      .resolveSchool(accessToken, schoolId)
      .then((s) => {
        if (!cancelled) setLoaded({ id: s.id, name: s.name, address: s.address });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [accessToken, schoolId, canView]);

  return loaded && loaded.id === schoolId ? loaded : null;
}
