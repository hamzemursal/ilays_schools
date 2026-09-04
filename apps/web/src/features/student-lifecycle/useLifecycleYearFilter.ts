"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";

export interface LifecycleYearOption {
  value: string;
  label: string;
}

// The Academic Year filter has two real modes, driven entirely by whether a
// specific school is selected — AcademicYear rows are per-school, so there's
// no single id that means "2027" everywhere:
//  - a school IS selected: options are that school's own AcademicYear rows,
//    value = the real id, matched server-side via academicYearId (exact).
//  - "All Schools": options are the distinct AcademicYear.name values across
//    every school the actor can see, value = the name itself, matched
//    server-side via academicYearName (aggregates every school's own row
//    with that name). Both come straight from the database — never
//    hardcoded — and the control stays enabled either way, so it never
//    looks broken when "All Schools" is active.
export function useLifecycleYearFilter(accessToken: string | null, schoolId: string, initialValue = "") {
  const [options, setOptions] = useState<LifecycleYearOption[]>([]);
  const [value, setValue] = useState(initialValue);
  const isNameMode = !schoolId;

  // A school change invalidates the previous selection — an id from one
  // school (or a name selected while "All Schools" was active) doesn't
  // necessarily mean anything once the mode/scope changes. Reset during
  // render (this codebase's established pattern for "adjust state when a
  // value changes") rather than synchronously inside the effect below.
  const [prevSchoolId, setPrevSchoolId] = useState(schoolId);
  if (schoolId !== prevSchoolId) {
    setPrevSchoolId(schoolId);
    setValue("");
  }

  useEffect(() => {
    if (!accessToken) return;
    if (schoolId) {
      api
        .listAcademicYears(accessToken, schoolId)
        .then((years) =>
          setOptions(years.map((y) => ({ value: y.id, label: y.isCurrent ? `${y.name} (current)` : y.name }))),
        )
        .catch(() => setOptions([]));
    } else {
      api
        .listLifecycleAcademicYearNames(accessToken, undefined)
        .then((years) =>
          setOptions(years.map((y) => ({ value: y.name, label: y.isCurrentAnywhere ? `${y.name} (current)` : y.name }))),
        )
        .catch(() => setOptions([]));
    }
  }, [accessToken, schoolId]);

  return {
    options,
    value,
    setValue,
    // The server-side filter pair to send — always exactly one is set.
    asFilters: isNameMode ? { academicYearId: undefined, academicYearName: value || undefined } : { academicYearId: value || undefined, academicYearName: undefined },
  };
}
