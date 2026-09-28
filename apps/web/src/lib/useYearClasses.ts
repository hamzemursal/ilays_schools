"use client";

import { useEffect, useState } from "react";
import { api, type ClassWithSections } from "@/lib/api";

// Classes are academic-year scoped (every year has its own Form 1, Class 8…).
// Calling api.listClasses WITHOUT a year returns only the school's CURRENT
// year's classes — so any form that lets the admin pick a year must list
// THAT year's classes, or every non-current year breaks the moment a new year
// is made current. This hook is that one rule: the classes of `academicYearId`
// in `schoolId`, reloaded whenever either changes. [] while none is chosen or
// the list is still loading (never a previous year's classes).
export function useYearClasses(accessToken: string | null, schoolId: string, academicYearId: string): ClassWithSections[] {
  const [loaded, setLoaded] = useState<{ key: string; classes: ClassWithSections[] } | null>(null);
  const key = `${schoolId}|${academicYearId}`;

  useEffect(() => {
    if (!accessToken || !schoolId || !academicYearId) return;
    let cancelled = false;
    const k = `${schoolId}|${academicYearId}`;
    api
      .listClasses(accessToken, schoolId, academicYearId)
      .then((classes) => {
        if (!cancelled) setLoaded({ key: k, classes });
      })
      .catch(() => {
        if (!cancelled) setLoaded({ key: k, classes: [] });
      });
    return () => {
      cancelled = true;
    };
  }, [accessToken, schoolId, academicYearId]);

  return academicYearId && loaded?.key === key ? loaded.classes : EMPTY;
}

const EMPTY: ClassWithSections[] = [];

// The same rule for a form with several rows that each pick their own year
// (e.g. a teacher's assignments): the classes of every year in `yearIds`,
// keyed by year id. A year still loading is simply absent from the map.
export function useClassesByYear(accessToken: string | null, schoolId: string, yearIds: string[]): Record<string, ClassWithSections[]> {
  const [byKey, setByKey] = useState<Record<string, ClassWithSections[]>>({});
  const wanted = [...new Set(yearIds.filter(Boolean))].sort().join(",");

  useEffect(() => {
    if (!accessToken || !schoolId || !wanted) return;
    let cancelled = false;
    for (const yearId of wanted.split(",")) {
      const k = `${schoolId}|${yearId}`;
      api
        .listClasses(accessToken, schoolId, yearId)
        .then((classes) => {
          if (!cancelled) setByKey((prev) => (prev[k] ? prev : { ...prev, [k]: classes }));
        })
        .catch(() => undefined);
    }
    return () => {
      cancelled = true;
    };
  }, [accessToken, schoolId, wanted]);

  const result: Record<string, ClassWithSections[]> = {};
  for (const yearId of wanted ? wanted.split(",") : []) {
    const classes = byKey[`${schoolId}|${yearId}`];
    if (classes) result[yearId] = classes;
  }
  return result;
}
