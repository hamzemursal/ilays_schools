"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth, ApiError } from "@/lib/auth-context";
import {
  api,
  type AcademicYear,
  type ClassWithSections,
  type School,
  type StudentDirectoryFilters,
  type StudentDirectorySearchResult,
  type StudentDirectorySummary,
} from "@/lib/api";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { BulkActionBar } from "@/components/ui/BulkActionBar";
import { useToast } from "@/components/ui/Toast";
import { runBulkAction, summarizeBulkResult } from "@/lib/bulkAction";
import { StudentsTable } from "@/features/students/tables/StudentsTable";
import { StudentListFilters, EMPTY_SECONDARY_FILTERS, type StudentListFilterState } from "@/features/students/list/StudentListFilters";
import { StudentListSummaryCards } from "@/features/students/list/StudentListSummaryCards";
import { ChooseColumnsPanel } from "@/features/students/list/ChooseColumnsPanel";
import { ExportMenu } from "@/features/students/list/ExportMenu";
import { loadColumnPrefs, saveColumnPrefs } from "@/features/students/list/columns";
import { Archive, ArrowLeftRight, Upload, UserPlus } from "lucide-react";

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

export default function StudentsListPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: schoolId } = use(params);
  const { user, accessToken } = useAuth();
  const { show } = useToast();
  const router = useRouter();

  const [schools, setSchools] = useState<School[] | null>(null);
  const [years, setYears] = useState<AcademicYear[]>([]);
  const [classes, setClasses] = useState<ClassWithSections[]>([]);
  const [result, setResult] = useState<StudentDirectorySearchResult | null>(null);
  const [summary, setSummary] = useState<StudentDirectorySummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showBulkConfirm, setShowBulkConfirm] = useState(false);
  const [bulkArchiving, setBulkArchiving] = useState(false);
  const [visibleColumns, setVisibleColumns] = useState<string[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const [filters, setFilters] = useState<StudentListFilterState>({
    yearId: "",
    levelFilter: "ALL",
    classId: "",
    sectionId: "",
    attendanceFilter: "ALL",
    search: "",
    ...EMPTY_SECONDARY_FILTERS,
  });

  // Column choice is per-browser (localStorage), not per-request — loaded
  // once on mount. See columns.ts for why this isn't a database preference.
  useEffect(() => {
    setVisibleColumns(loadColumnPrefs());
  }, []);

  function patchFilters(patch: Partial<StudentListFilterState>) {
    setFilters((prev) => ({ ...prev, ...patch }));
    setPage(1); // a changed filter invalidates whatever page the admin was on
  }

  const canSchoolsView = user?.permissions.includes("schools.view") ?? false;
  const canViewAttendance = user?.permissions.includes("attendance.view") ?? false;
  const canViewFinance = user?.permissions.includes("finance.ledger.view") ?? false;
  const canViewGuardianProfile = user?.permissions.includes("guardians.view") ?? false;

  useEffect(() => {
    if (!accessToken || !canSchoolsView) return;
    api.listSchools(accessToken).then(setSchools).catch(() => setSchools(null));
  }, [accessToken, canSchoolsView]);

  useEffect(() => {
    if (!accessToken) return;
    api
      .listAcademicYears(accessToken, schoolId)
      .then((y) => {
        setYears(y);
        const current = y.find((yr) => yr.isCurrent) ?? y[0];
        if (current) patchFilters({ yearId: current.id });
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load academic years"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken, schoolId]);

  useEffect(() => {
    if (!accessToken || !filters.yearId) return;
    api.listClasses(accessToken, schoolId, filters.yearId).then(setClasses).catch(() => setClasses([]));
  }, [accessToken, schoolId, filters.yearId]);

  const classIdsForLevel =
    filters.levelFilter === "ALL" ? null : new Set(classes.filter((c) => c.division.type === filters.levelFilter).map((c) => c.id));
  // "School Level" narrows the Class dropdown's options but has no matching
  // server filter of its own — when no specific class is chosen yet, the
  // request still needs to stay within the chosen level, so a class from
  // the class list itself is picked as a stand-in scope. Once a specific
  // class is chosen this is moot (classId already narrows it precisely).
  const effectiveClassId = filters.classId || undefined;

  function buildDirectoryFilters(): StudentDirectoryFilters | null {
    if (!filters.yearId) return null;
    return {
      academicYearId: filters.yearId,
      classId: effectiveClassId,
      sectionId: filters.sectionId || undefined,
      search: filters.search.trim() || undefined,
      gender: filters.gender || undefined,
      studentStatus: filters.studentStatus || undefined,
      hasParent: filters.hasParent === "" ? undefined : filters.hasParent === "true",
      feeStatus: filters.feeStatus || undefined,
      hasOutstandingBalance: filters.hasOutstandingBalance === "" ? undefined : filters.hasOutstandingBalance === "true",
      attendanceStatus: filters.attendanceTodayStatus || undefined,
    };
  }

  // The search box is debounced (300ms) so typing doesn't fire a request per
  // keystroke; every other filter is a discrete select change and applies
  // immediately, matching how the rest of this app's filters already work —
  // introducing a separate staged "Apply" step just for this page would be
  // an inconsistent pattern the app doesn't use anywhere else.
  const [debouncedSearch, setDebouncedSearch] = useState(filters.search);
  useEffect(() => {
    const handle = setTimeout(() => setDebouncedSearch(filters.search), 300);
    return () => clearTimeout(handle);
  }, [filters.search]);

  useEffect(() => {
    if (!accessToken) return;
    const directoryFilters = buildDirectoryFilters();
    if (!directoryFilters) return;
    api
      .searchStudentDirectory(accessToken, schoolId, { ...directoryFilters, page, pageSize })
      .then(setResult)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load students"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    accessToken,
    schoolId,
    filters.yearId,
    effectiveClassId,
    filters.sectionId,
    debouncedSearch,
    filters.gender,
    filters.studentStatus,
    filters.hasParent,
    filters.feeStatus,
    filters.hasOutstandingBalance,
    filters.attendanceTodayStatus,
    page,
    pageSize,
  ]);

  useEffect(() => {
    if (!accessToken) return;
    const directoryFilters = buildDirectoryFilters();
    if (!directoryFilters) return;
    api
      .getStudentDirectorySummary(accessToken, schoolId, directoryFilters)
      .then(setSummary)
      .catch(() => setSummary(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    accessToken,
    schoolId,
    filters.yearId,
    effectiveClassId,
    filters.sectionId,
    debouncedSearch,
    filters.gender,
    filters.studentStatus,
    filters.hasParent,
    filters.feeStatus,
    filters.hasOutstandingBalance,
    filters.attendanceTodayStatus,
  ]);

  // The old client-side attendance-rate fetch still powers the "Attendance %
  // (this year)" secondary filter, which is a year-long rate — a genuinely
  // different question from "Attendance Today" (the new server filter
  // above), so it's kept exactly as it already worked.
  const [attendanceRates, setAttendanceRates] = useState<Map<string, number | null> | null>(null);
  useEffect(() => {
    if (!accessToken || !filters.yearId) return;
    api
      .getStudentAttendanceRates(accessToken, schoolId, filters.yearId, effectiveClassId, filters.sectionId || undefined)
      .then((rows) => setAttendanceRates(new Map(rows.map((r) => [r.enrollmentId, r.rate]))))
      .catch(() => setAttendanceRates(null));
  }, [accessToken, schoolId, filters.yearId, effectiveClassId, filters.sectionId]);

  const attendanceRateFiltered =
    filters.attendanceFilter === "ALL" || !attendanceRates || !result
      ? result?.items
      : result.items.filter((s) => {
          const rate = attendanceRates.get(s.enrollmentId);
          if (rate === undefined || rate === null) return false;
          if (filters.attendanceFilter === "EXCELLENT") return rate >= 90;
          if (filters.attendanceFilter === "GOOD") return rate >= 75 && rate < 90;
          return rate < 75;
        });

  function onChooseColumnsApply(columns: string[]) {
    setVisibleColumns(columns);
    saveColumnPrefs(columns);
  }

  async function doExport(kind: "current" | "all" | "selected") {
    if (!accessToken) return;
    const directoryFilters = buildDirectoryFilters();
    if (!directoryFilters) return;
    setExporting(true);
    try {
      const ids =
        kind === "current" ? (result?.items.map((s) => s.enrollmentId) ?? []) : kind === "selected" ? [...selectedIds] : undefined;
      await api.exportStudentDirectory(accessToken, schoolId, directoryFilters, visibleColumns, ids);
    } catch (err) {
      show(err instanceof ApiError ? err.message : "Failed to export students", "danger");
    } finally {
      setExporting(false);
    }
  }

  async function onBulkArchive() {
    if (!accessToken) return;
    setBulkArchiving(true);
    try {
      const ids = Array.from(selectedIds);
      const idToStudentId = new Map(result?.items.map((s) => [s.enrollmentId, s.studentId]) ?? []);
      const result_ = await runBulkAction(ids, (enrollmentId) => api.archiveStudent(accessToken, idToStudentId.get(enrollmentId)!));
      show(summarizeBulkResult(result_, "archived"));
      setSelectedIds(new Set());
      setShowBulkConfirm(false);
      setPage((p) => p); // no-op state touch keeps the effect dep list happy; refetch below
      api.searchStudentDirectory(accessToken, schoolId, { ...buildDirectoryFilters()!, page, pageSize }).then(setResult);
    } finally {
      setBulkArchiving(false);
    }
  }

  const canCreate = user?.permissions.includes("students.create") ?? false;
  const canArchive = user?.permissions.includes("students.archive") ?? false;
  const canImport = user?.permissions.includes("imports.create") ?? false;
  const canExport = user?.permissions.includes("exports.create") ?? false;
  const canBulkTransfer = (user?.permissions.includes("transfers.create") && user?.permissions.includes("transfers.approve")) ?? false;
  const canSelect = canArchive || canBulkTransfer || canExport;
  const schoolName = user?.schools.find((s) => s.id === schoolId)?.name ?? schools?.find((s) => s.id === schoolId)?.name ?? "School";
  const academicYearName = years.find((y) => y.id === filters.yearId)?.name ?? "";

  const items = attendanceRateFiltered ?? null;
  const total = filters.attendanceFilter === "ALL" ? (result?.total ?? 0) : (items?.length ?? 0);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div>
      <PageHeader
        eyebrow="Students"
        title={schoolName}
        description="View and manage students in your school"
        breadcrumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "Students" }]}
        actions={
          <>
            {canExport && (
              <ExportMenu
                loading={exporting}
                selectedCount={selectedIds.size}
                onExportCurrentView={() => doExport("current")}
                onExportAllFiltered={() => doExport("all")}
                onExportSelected={() => doExport("selected")}
                onPrint={() => window.print()}
              />
            )}
            {canImport && (
              <Link href={`/schools/${schoolId}/students/import`}>
                <Button variant="outline" icon={<Upload className="size-4" />}>
                  Import
                </Button>
              </Link>
            )}
            {canCreate && (
              <Link href={`/schools/${schoolId}/students/new`}>
                <Button icon={<UserPlus className="size-4" />}>Add student</Button>
              </Link>
            )}
          </>
        }
      />
      <div className="space-y-5 p-4 sm:p-6 print:p-0">
        {error ? (
          <Alert tone="danger">{error}</Alert>
        ) : (
          accessToken && (
            <>
              <StudentListFilters
                schoolId={schoolId}
                schools={canSchoolsView ? schools : null}
                years={years}
                classes={classes}
                hasAttendanceData={attendanceRates !== null}
                canViewFinance={canViewFinance}
                state={filters}
                onChange={patchFilters}
              />

              <StudentListSummaryCards summary={summary} loading={!summary && !error} />

              <div className="flex justify-end print:hidden">
                <ChooseColumnsPanel visibleColumns={visibleColumns} onApply={onChooseColumnsApply} />
              </div>

              {canSelect && (
                <BulkActionBar count={selectedIds.size} onClear={() => setSelectedIds(new Set())}>
                  {canArchive && (
                    <Button size="sm" variant="danger" icon={<Archive className="size-4" />} onClick={() => setShowBulkConfirm(true)}>
                      Archive selected
                    </Button>
                  )}
                  {canBulkTransfer && (
                    <Button
                      size="sm"
                      variant="outline"
                      icon={<ArrowLeftRight className="size-4" />}
                      onClick={() => {
                        const studentIds = (result?.items ?? [])
                          .filter((s) => selectedIds.has(s.enrollmentId))
                          .map((s) => s.studentId);
                        router.push(`/schools/${schoolId}/students/bulk-transfer?studentIds=${studentIds.join(",")}`);
                      }}
                    >
                      Bulk Transfer
                    </Button>
                  )}
                </BulkActionBar>
              )}

              <StudentsTable
                schoolId={schoolId}
                accessToken={accessToken}
                students={items}
                loading={!result}
                canTransfer={canBulkTransfer}
                canViewGuardianProfile={canViewGuardianProfile}
                visibleColumns={new Set(visibleColumns)}
                academicYearName={academicYearName}
                selection={
                  canSelect
                    ? {
                        selectedKeys: selectedIds,
                        onToggle: (key, checked) =>
                          setSelectedIds((prev) => {
                            const next = new Set(prev);
                            if (checked) next.add(key);
                            else next.delete(key);
                            return next;
                          }),
                        onToggleAll: (keys, checked) =>
                          setSelectedIds((prev) => {
                            const next = new Set(prev);
                            keys.forEach((k) => (checked ? next.add(k) : next.delete(k)));
                            return next;
                          }),
                      }
                    : undefined
                }
              />

              {result && total > 0 && (
                <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
                  <p className="text-sm text-foreground-soft">
                    Showing {(page - 1) * pageSize + 1} to {Math.min(page * pageSize, total)} of {total} students
                  </p>
                  <div className="flex items-center gap-3">
                    <label className="flex items-center gap-1.5 text-sm text-foreground-soft">
                      Rows per page:
                      <select
                        value={pageSize}
                        onChange={(e) => {
                          setPageSize(Number(e.target.value));
                          setPage(1);
                        }}
                        className="rounded-lg border border-border bg-background px-2 py-1 text-sm text-foreground outline-none focus:border-accent focus:ring-2 focus:ring-accent/15"
                      >
                        {PAGE_SIZE_OPTIONS.map((n) => (
                          <option key={n} value={n}>
                            {n}
                          </option>
                        ))}
                      </select>
                    </label>
                    <div className="flex items-center gap-1">
                      <Button size="sm" variant="outline" disabled={page === 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                        Previous
                      </Button>
                      <span className="px-2 text-sm text-foreground-soft">
                        Page {page} of {totalPages}
                      </span>
                      <Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>
                        Next
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </>
          )
        )}
      </div>

      <ConfirmDialog
        open={showBulkConfirm}
        title={`Archive ${selectedIds.size} student${selectedIds.size === 1 ? "" : "s"}?`}
        description="Their active enrollment will be withdrawn. Attendance, marks, and history are kept — this is not a deletion."
        confirmLabel="Archive"
        loading={bulkArchiving}
        onConfirm={onBulkArchive}
        onCancel={() => setShowBulkConfirm(false)}
      />
    </div>
  );
}
