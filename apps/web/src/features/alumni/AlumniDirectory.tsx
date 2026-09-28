"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Eye, GraduationCap, RotateCcw, Search } from "lucide-react";
import { ApiError, useAuth } from "@/lib/auth-context";
import { api, type AlumniDirectoryResponse, type DivisionType, type LifecycleEnrollmentRow, type School } from "@/lib/api";
import { PageHeader, type Crumb } from "@/components/ui/PageHeader";
import { Alert } from "@/components/ui/Alert";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/FormControls";
import { LifecycleTable, type LifecycleColumn } from "@/features/student-lifecycle/LifecycleTable";
import { useLifecycleYearFilter } from "@/features/student-lifecycle/useLifecycleYearFilter";

// The Alumni Directory — read-only, backed by
// StudentLifecycleService.listAlumniDirectory. Two different kinds of former
// student are kept clearly apart:
//   * Alumni (the default view): Form 4 GRADUATED — the official alumni;
//   * Primary completers: Class 8 COMPLETED who did not continue to Form 1.
// "All former students" shows both, each row labelled with its Type. No
// records are copied anywhere: every row is the student's own finishing
// enrollment.

type DirectoryType = DivisionType | "";

const TYPE_OPTIONS: { value: DirectoryType; label: string }[] = [
  { value: "SECONDARY", label: "Alumni — Form 4 graduates" },
  { value: "PRIMARY", label: "Primary completers — Class 8" },
  { value: "", label: "All former students" },
];

const HEADER: Record<string, { title: string; description: string; one: string; many: string }> = {
  SECONDARY: { title: "Alumni", description: "Form 4 graduates and their academic history", one: "alumnus", many: "alumni" },
  PRIMARY: {
    title: "Primary Completers",
    description: "Students who completed Class 8 and did not continue to Form 1",
    one: "primary completer",
    many: "primary completers",
  },
  "": { title: "Former Students", description: "Form 4 graduates and Class 8 completers", one: "former student", many: "former students" },
};

export function alumniProfileHref(row: Pick<LifecycleEnrollmentRow, "school" | "studentId">): string {
  return `/schools/${row.school.id}/alumni/${row.studentId}`;
}

// The one label that tells an official alumnus from a primary completer.
export function FormerStudentTypePill({ status }: { status: LifecycleEnrollmentRow["enrollmentStatus"] }) {
  return status === "GRADUATED" ? (
    <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-accent-soft px-2.5 py-0.5 text-xs font-medium text-accent">
      <GraduationCap className="size-3.5" /> Graduated — Form 4
    </span>
  ) : (
    <span className="inline-flex items-center whitespace-nowrap rounded-full border border-border bg-surface-soft px-2.5 py-0.5 text-xs font-medium text-foreground-soft">
      Completed — Class 8
    </span>
  );
}

export function AlumniDirectory({ fixedSchoolId, breadcrumbs }: { fixedSchoolId?: string; breadcrumbs?: Crumb[] }) {
  const { accessToken } = useAuth();

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [schools, setSchools] = useState<School[]>([]);
  const [schoolId, setSchoolId] = useState(fixedSchoolId ?? "");
  const year = useLifecycleYearFilter(accessToken, schoolId);
  // Type = which final class the student finished (fixed: Form 4 =
  // Secondary alumni, Class 8 = Primary completers). Defaults to Alumni.
  const [division, setDivision] = useState<DirectoryType>("SECONDARY");
  const [sectionName, setSectionName] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  // Keyed by the exact request it answers, so a new filter/page shows as
  // loading without resetting state inside the effect.
  const [loaded, setLoaded] = useState<{ key: string; result: AlumniDirectoryResponse | null; error: string | null } | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    if (!accessToken || fixedSchoolId) return;
    api.listSchools(accessToken).then(setSchools).catch(() => undefined);
  }, [accessToken, fixedSchoolId]);

  const filterKey = JSON.stringify({ schoolId, year: year.value, division, sectionName, search: debouncedSearch, pageSize });
  const [prevFilterKey, setPrevFilterKey] = useState(filterKey);
  if (filterKey !== prevFilterKey) {
    setPrevFilterKey(filterKey);
    setPage(1);
  }

  const fetchKey = `${filterKey}:${page}`;
  const current = loaded?.key === fetchKey ? loaded : null;
  const loading = !current;
  const error = current?.error ?? null;
  // The previous result (facets, count) stays available while the next loads.
  const result = current?.result ?? loaded?.result ?? null;

  useEffect(() => {
    if (!accessToken) return;
    let cancelled = false;
    const key = `${filterKey}:${page}`;
    api
      .listAlumniDirectory(accessToken, {
        schoolId: schoolId || undefined,
        ...year.asFilters,
        divisionType: division || undefined,
        sectionName: sectionName || undefined,
        search: debouncedSearch || undefined,
        page,
        pageSize,
      })
      .then((r) => {
        if (!cancelled) setLoaded({ key, result: r, error: null });
      })
      .catch((err) => {
        if (!cancelled) setLoaded({ key, result: null, error: err instanceof ApiError ? err.message : "Failed to load alumni" });
      });
    return () => {
      cancelled = true;
    };
    // filterKey captures every filter value.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken, filterKey, page]);

  const hasFilters = !!(search || (!fixedSchoolId && schoolId) || year.value || division !== "SECONDARY" || sectionName);
  function reset() {
    setSearch("");
    if (!fixedSchoolId) setSchoolId("");
    year.setValue("");
    setDivision("SECONDARY");
    setSectionName("");
  }
  const header = HEADER[division];

  const columns: LifecycleColumn[] = [
    {
      key: "student",
      header: "Student",
      render: (r) => (
        <Link href={alumniProfileHref(r)} className="flex items-center gap-2.5 font-medium text-foreground hover:text-accent">
          <Avatar name={`${r.firstName} ${r.lastName}`} size="sm" />
          <span className="truncate">
            {r.firstName} {r.lastName}
          </span>
        </Link>
      ),
    },
    { key: "studentNumber", header: "Student ID", render: (r) => <span className="whitespace-nowrap font-mono text-xs">{r.studentNumber}</span> },
    { key: "school", header: "School", render: (r) => r.school.name },
    { key: "type", header: "Type", render: (r) => <FormerStudentTypePill status={r.enrollmentStatus} /> },
    { key: "class", header: "Final Class/Form", render: (r) => r.class.name },
    { key: "section", header: "Section", render: (r) => r.section.name },
    { key: "year", header: division === "SECONDARY" ? "Graduation Year" : "Year Finished", render: (r) => r.academicYear.name },
    {
      key: "view",
      header: "",
      render: (r) => (
        <Link
          href={alumniProfileHref(r)}
          aria-label={`View ${r.firstName} ${r.lastName}`}
          className="inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-sm font-medium text-foreground-soft transition-colors hover:bg-surface-hover hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
        >
          <Eye className="size-4" /> View
        </Link>
      ),
    },
  ];

  const total = result?.pagination.total ?? 0;

  return (
    <div>
      <PageHeader title={header.title} description={header.description} breadcrumbs={breadcrumbs} />

      <div className="space-y-4 p-4 sm:p-6">
        <div className="rounded-xl border border-border bg-background p-4 shadow-sm">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-foreground-muted" />
            <Input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name or Student ID"
              aria-label="Search alumni"
              className="pl-9"
            />
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
            <FilterSelect label="Type" value={division} onChange={(v) => setDivision(v as DirectoryType)}>
              {TYPE_OPTIONS.map((o) => (
                <option key={o.value || "all"} value={o.value}>
                  {o.label}
                </option>
              ))}
            </FilterSelect>
            <FilterSelect label={division === "SECONDARY" ? "Graduation Year" : "Year Finished"} value={year.value} onChange={year.setValue}>
              <option value="">All years</option>
              {year.options.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </FilterSelect>
            {!fixedSchoolId && (
              <FilterSelect label="School" value={schoolId} onChange={setSchoolId}>
                <option value="">All schools</option>
                {schools.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </FilterSelect>
            )}
            <FilterSelect label="Section" value={sectionName} onChange={setSectionName}>
              <option value="">All sections</option>
              {(result?.facets.sectionNames ?? []).map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </FilterSelect>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-foreground-soft" aria-live="polite">
            {loading ? "Loading…" : `${total} ${total === 1 ? header.one : header.many}`}
          </p>
          {hasFilters && (
            <Button size="sm" variant="ghost" icon={<RotateCcw className="size-4" />} onClick={reset}>
              Clear filters
            </Button>
          )}
        </div>

        {error ? (
          <Alert tone="danger">{error}</Alert>
        ) : (
          <LifecycleTable
            rows={loading ? null : (result?.data ?? [])}
            pagination={result?.pagination ?? null}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
            columns={columns}
            emptyTitle={hasFilters ? `No ${header.many} match these filters` : `No ${header.many} yet`}
            emptyDescription={
              hasFilters
                ? "Try a different type, year, school or search."
                : "Form 4 graduates appear here once graduation is confirmed; Class 8 completers once they complete without continuing."
            }
            itemLabel={header.many}
          />
        )}
      </div>
    </div>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: React.ReactNode;
}) {
  const id = `alumni-filter-${label.toLowerCase().replace(/[^a-z]+/g, "-")}`;
  return (
    <div className="min-w-0">
      <label htmlFor={id} className="mb-1 block text-xs font-medium text-foreground-soft">
        {label}
      </label>
      <Select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
        {children}
      </Select>
    </div>
  );
}
