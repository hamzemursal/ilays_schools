"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowUpCircle } from "lucide-react";
import { useAuth, ApiError } from "@/lib/auth-context";
import { api, type LifecycleEnrollmentRow, type LifecycleListResponse, type School } from "@/lib/api";
import { PageHeader, type Crumb } from "@/components/ui/PageHeader";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/FormControls";
import { BulkActionBar } from "@/components/ui/BulkActionBar";
import { LifecycleFilterBar } from "./LifecycleFilterBar";
import { LifecycleTable, type LifecycleColumn, type LifecycleTableSelection } from "./LifecycleTable";
import { LifecycleStatusBadge } from "./LifecycleBadges";
import { resolvePrimaryRowState, resolveSecondaryRowState, formatLifecycleDate } from "./state";
import { useLifecycleYearFilter } from "./useLifecycleYearFilter";

export type LifecycleListKind = "primary-completed" | "secondary-graduated" | "awaiting-enrollment" | "alumni";

const FETCHERS: Record<LifecycleListKind, (accessToken: string, filters: import("@/lib/api").LifecycleListFilters) => Promise<LifecycleListResponse>> = {
  "primary-completed": api.listPrimaryCompleted,
  "awaiting-enrollment": api.listAwaitingEnrollment,
  "secondary-graduated": api.listSecondaryGraduated,
  alumni: api.listAlumni,
};

const IS_SECONDARY: Record<LifecycleListKind, boolean> = {
  "primary-completed": false,
  "awaiting-enrollment": false,
  "secondary-graduated": true,
  alumni: true,
};

const EMPTY_COPY: Record<LifecycleListKind, { title: string; description: string }> = {
  "primary-completed": {
    title: "No Primary completions found",
    description: "Students who finish the final Primary class will appear here once Primary Completion is run.",
  },
  "awaiting-enrollment": {
    title: "No one is awaiting enrollment",
    description: "Every Primary-completed student here has already moved on, transferred, or withdrawn.",
  },
  "secondary-graduated": {
    title: "No Secondary graduations found",
    description: "Students who finish the final Secondary class will appear here.",
  },
  alumni: { title: "No alumni yet", description: "Graduated students appear here as alumni." },
};

// Status dropdown per kind — Awaiting Enrollment and Alumni are always
// forced server-side to one bucket (see StudentLifecycleService), so they
// get no dropdown at all; Primary Completed defaults to "Awaiting Form 1"
// per the approved spec (completing Primary never implies enrollment), but
// can be widened to see the other substates in the same completion record.
const STATUS_OPTIONS: Partial<Record<LifecycleListKind, { value: string; label: string }[]>> = {
  "primary-completed": [
    { value: "AWAITING", label: "Awaiting Form 1" },
    { value: "ENROLLED_FORM1", label: "Enrolled in Form 1" },
    { value: "TRANSFERRED_OUT", label: "Transferred Out" },
    { value: "WITHDRAWN", label: "Withdrawn" },
    { value: "", label: "All" },
  ],
  "secondary-graduated": [
    { value: "", label: "Graduated" },
    { value: "PENDING", label: "Graduation Pending" },
    { value: "TRANSFERRED_OUT", label: "Transferred Out" },
  ],
};

const DEFAULT_STATUS: Partial<Record<LifecycleListKind, string>> = {
  "primary-completed": "AWAITING",
};

export function LifecycleListExplorer({
  kind,
  fixedSchoolId,
  pageTitle,
  breadcrumbs,
}: {
  kind: LifecycleListKind;
  fixedSchoolId?: string;
  pageTitle: string;
  breadcrumbs?: Crumb[];
}) {
  const { accessToken } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [schools, setSchools] = useState<School[]>([]);
  const [schoolId, setSchoolId] = useState(fixedSchoolId ?? searchParams.get("schoolId") ?? "");
  // Seeded from whichever query param matches the initial school mode — a
  // link built while "All Schools" was active carries academicYearName,
  // one built for a specific school carries academicYearId.
  const year = useLifecycleYearFilter(
    accessToken,
    schoolId,
    schoolId ? (searchParams.get("academicYearId") ?? "") : (searchParams.get("academicYearName") ?? ""),
  );
  const [status, setStatus] = useState(searchParams.get("status") ?? DEFAULT_STATUS[kind] ?? "");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [result, setResult] = useState<LifecycleListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 350);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    if (!accessToken || fixedSchoolId) return;
    api
      .listSchools(accessToken)
      .then(setSchools)
      .catch(() => undefined);
  }, [accessToken, fixedSchoolId]);

  const filterKey = JSON.stringify({ schoolId, year: year.value, status, search: debouncedSearch, pageSize, kind });
  const fetchKey = `${filterKey}:${page}`;
  const [prevFilterKey, setPrevFilterKey] = useState(filterKey);
  const [prevFetchKey, setPrevFetchKey] = useState(fetchKey);
  if (filterKey !== prevFilterKey) {
    setPrevFilterKey(filterKey);
    setPage(1);
    setSelected(new Set());
  }
  if (fetchKey !== prevFetchKey) {
    setPrevFetchKey(fetchKey);
    setLoading(true);
    setError(null);
  }

  useEffect(() => {
    if (!accessToken) return;
    FETCHERS[kind](accessToken, {
      schoolId: schoolId || undefined,
      ...year.asFilters,
      status: status || undefined,
      search: debouncedSearch || undefined,
      page,
      pageSize,
    })
      .then(setResult)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load this list"))
      .finally(() => setLoading(false));
    // filterKey already captures schoolId/year.value/status/search/pageSize.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken, filterKey, page]);

  function handleReset() {
    setSearch("");
    if (!fixedSchoolId) setSchoolId("");
    year.setValue("");
    setStatus(DEFAULT_STATUS[kind] ?? "");
  }

  const statusOptions = STATUS_OPTIONS[kind];
  const isSecondary = IS_SECONDARY[kind];
  const rowState = isSecondary ? resolveSecondaryRowState : resolvePrimaryRowState;

  const studentColumn: LifecycleColumn = {
    key: "student",
    header: "Student",
    render: (row) => (
      <Link
        href={`/schools/${row.school.id}/students/${row.studentId}`}
        className="font-medium text-foreground hover:text-accent hover:underline"
      >
        {row.firstName} {row.lastName}
      </Link>
    ),
  };
  const studentIdColumn: LifecycleColumn = { key: "studentNumber", header: "Student ID", render: (r) => r.studentNumber };
  const schoolColumn: LifecycleColumn = { key: "school", header: "School", render: (r) => r.school.name };
  const classColumn: LifecycleColumn = {
    key: "class",
    header: "Final Class",
    render: (r) => r.class.name,
  };
  const sectionColumn: LifecycleColumn = { key: "section", header: "Section", render: (r) => r.section.name };
  const yearColumn: LifecycleColumn = { key: "year", header: "Academic Year", render: (r) => r.academicYear.name };
  const statusColumn: LifecycleColumn = { key: "status", header: "Status", render: (r) => <LifecycleStatusBadge state={rowState(r)} /> };
  const nextStepColumn: LifecycleColumn = { key: "nextStep", header: "Next Step", render: (r) => rowState(r).nextStep };

  function actionsCell(row: LifecycleEnrollmentRow) {
    const state = rowState(row);
    if (!state.actionable) {
      return (
        <Link href={`/schools/${row.school.id}/students/${row.studentId}`}>
          <Button size="sm" variant="ghost">
            View Profile
          </Button>
        </Link>
      );
    }
    if (!isSecondary) {
      return (
        <Link href={`/schools/${row.school.id}/student-lifecycle/form-1-transition?enrollmentId=${row.enrollmentId}`}>
          <Button size="sm" variant="outline" icon={<ArrowUpCircle className="size-3.5" />}>
            Start Form 1 Transition
          </Button>
        </Link>
      );
    }
    return (
      <Link href={`/schools/${row.school.id}/promotions`}>
        <Button size="sm" variant="outline">
          Go to Promotions
        </Button>
      </Link>
    );
  }
  const actionsColumn: LifecycleColumn = { key: "actions", header: "Actions", render: actionsCell };

  let columns: LifecycleColumn[];
  if (kind === "primary-completed") {
    columns = [
      studentColumn,
      studentIdColumn,
      schoolColumn,
      classColumn,
      sectionColumn,
      yearColumn,
      { key: "completionDate", header: "Completion Date", render: (r) => formatLifecycleDate(r.endDate) },
      statusColumn,
      nextStepColumn,
      actionsColumn,
    ];
  } else if (kind === "secondary-graduated") {
    columns = [
      studentColumn,
      studentIdColumn,
      schoolColumn,
      classColumn,
      sectionColumn,
      yearColumn,
      { key: "graduationDate", header: "Graduation Date", render: (r) => formatLifecycleDate(r.endDate) },
      statusColumn,
      nextStepColumn,
      actionsColumn,
    ];
  } else if (kind === "awaiting-enrollment") {
    columns = [
      studentColumn,
      studentIdColumn,
      { key: "prevSchool", header: "Previous School", render: (r) => r.school.name },
      { key: "prevYear", header: "Previous Academic Year", render: (r) => r.academicYear.name },
      { key: "prevClass", header: "Previous Class", render: (r) => r.class.name },
      { key: "prevSection", header: "Previous Section", render: (r) => r.section.name },
      { key: "completionStatus", header: "Completion Status", render: (r) => <LifecycleStatusBadge state={rowState(r)} /> },
      { key: "nextAction", header: "Available Next Action", render: (r) => rowState(r).nextStep },
      actionsColumn,
    ];
  } else {
    columns = [studentColumn, studentIdColumn, schoolColumn, classColumn, sectionColumn, yearColumn, { key: "graduationDate", header: "Graduation Date", render: (r) => formatLifecycleDate(r.endDate) }, statusColumn];
  }

  const supportsBulkTransition = kind === "awaiting-enrollment";
  const selectedRows = (result?.data ?? []).filter((r) => selected.has(r.enrollmentId));
  const selectedSchoolIds = new Set(selectedRows.map((r) => r.school.id));

  const selection: LifecycleTableSelection | undefined = supportsBulkTransition
    ? {
        selectedIds: selected,
        onToggle: (id, checked) =>
          setSelected((prev) => {
            const next = new Set(prev);
            if (checked) next.add(id);
            else next.delete(id);
            return next;
          }),
        onToggleAll: (ids, checked) =>
          setSelected((prev) => {
            const next = new Set(prev);
            for (const id of ids) {
              if (checked) next.add(id);
              else next.delete(id);
            }
            return next;
          }),
      }
    : undefined;

  function startBulkTransition() {
    if (selectedSchoolIds.size !== 1) return;
    const targetSchoolId = [...selectedSchoolIds][0];
    const ids = selectedRows.map((r) => r.enrollmentId).join(",");
    router.push(`/schools/${targetSchoolId}/student-lifecycle/form-1-transition?enrollmentIds=${ids}`);
  }

  return (
    <div>
      <PageHeader eyebrow="Student Lifecycle" title={pageTitle} breadcrumbs={breadcrumbs} />

      <div className="space-y-5 p-4 sm:p-6">
        <div className="flex flex-wrap items-end gap-2.5">
          <LifecycleFilterBar
            search={search}
            onSearchChange={setSearch}
            schools={fixedSchoolId ? undefined : schools.map((s) => ({ id: s.id, name: s.name }))}
            schoolId={schoolId}
            onSchoolChange={setSchoolId}
            academicYearOptions={year.options}
            academicYearValue={year.value}
            onAcademicYearChange={year.setValue}
            onReset={handleReset}
          />
          {statusOptions && (
            <div>
              <label className="mb-1 block text-xs font-medium text-foreground-soft">Status</label>
              <Select value={status} onChange={(e) => setStatus(e.target.value)} className="w-44">
                {statusOptions.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>
            </div>
          )}
        </div>

        {supportsBulkTransition && (
          <BulkActionBar count={selected.size} onClear={() => setSelected(new Set())}>
            <Button
              size="sm"
              icon={<ArrowUpCircle className="size-4" />}
              disabled={selectedSchoolIds.size !== 1}
              onClick={startBulkTransition}
            >
              Start Form 1 Transition
            </Button>
            {selectedSchoolIds.size > 1 && (
              <span className="text-xs text-warning">Select students from one school at a time</span>
            )}
          </BulkActionBar>
        )}

        {error ? (
          <Alert tone="danger">{error}</Alert>
        ) : (
          <LifecycleTable
            rows={loading ? null : (result?.data ?? [])}
            pagination={result?.pagination ?? null}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
            columns={columns}
            emptyTitle={EMPTY_COPY[kind].title}
            emptyDescription={EMPTY_COPY[kind].description}
            selection={selection}
          />
        )}
      </div>
    </div>
  );
}
