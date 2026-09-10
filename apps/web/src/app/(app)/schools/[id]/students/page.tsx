"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth, ApiError } from "@/lib/auth-context";
import { api, type AcademicYear, type ClassWithSections, type School, type StudentListItem } from "@/lib/api";
import { studentsApi } from "@/features/students/api";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { BulkActionBar } from "@/components/ui/BulkActionBar";
import { useToast } from "@/components/ui/Toast";
import { runBulkAction, summarizeBulkResult } from "@/lib/bulkAction";
import { StudentsTable } from "@/features/students/tables/StudentsTable";
import { StudentListFilters, type StudentListFilterState } from "@/features/students/list/StudentListFilters";
import { StudentListSummaryCards } from "@/features/students/list/StudentListSummaryCards";
import { Archive, ArrowLeftRight, Download, Printer, Upload, UserPlus } from "lucide-react";

export default function StudentsListPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: schoolId } = use(params);
  const { user, accessToken } = useAuth();
  const { show } = useToast();
  const router = useRouter();

  const [schools, setSchools] = useState<School[] | null>(null);
  const [years, setYears] = useState<AcademicYear[]>([]);
  const [classes, setClasses] = useState<ClassWithSections[]>([]);
  const [students, setStudents] = useState<StudentListItem[] | null>(null);
  const [attendanceRates, setAttendanceRates] = useState<Map<string, number | null> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showBulkConfirm, setShowBulkConfirm] = useState(false);
  const [bulkArchiving, setBulkArchiving] = useState(false);

  const [filters, setFilters] = useState<StudentListFilterState>({
    yearId: "",
    levelFilter: "ALL",
    classId: "",
    sectionId: "",
    attendanceFilter: "ALL",
    search: "",
  });

  function patchFilters(patch: Partial<StudentListFilterState>) {
    setFilters((prev) => ({ ...prev, ...patch }));
  }

  const canSchoolsView = user?.permissions.includes("schools.view") ?? false;

  // The School selector is a School Admin's one non-negotiable restriction —
  // gated purely on whether this actor can even call GET /schools at all
  // (Super/Org Admin only; a School Admin's role never gets schools.view —
  // see the RBAC seed), so there's no client-side toggle to bypass: without
  // the permission, the request below fails and this list simply stays null.
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
  }, [accessToken, schoolId]);

  useEffect(() => {
    if (!accessToken || !filters.yearId) return;
    api.listClasses(accessToken, schoolId, filters.yearId).then(setClasses).catch(() => setClasses([]));
  }, [accessToken, schoolId, filters.yearId]);

  useEffect(() => {
    if (!accessToken || !filters.yearId) return;
    api
      .listStudents(accessToken, schoolId, {
        academicYearId: filters.yearId,
        classId: filters.classId || undefined,
        sectionId: filters.sectionId || undefined,
      })
      .then(setStudents)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load students"));
  }, [accessToken, schoolId, filters.yearId, filters.classId, filters.sectionId]);

  useEffect(() => {
    if (!accessToken || !filters.yearId) return;
    api
      .getStudentAttendanceRates(accessToken, schoolId, filters.yearId, filters.classId || undefined, filters.sectionId || undefined)
      .then((rows) => setAttendanceRates(new Map(rows.map((r) => [r.enrollmentId, r.rate]))))
      // Attendance is an enhancement, not core to the list — if this call
      // fails for any reason the table/cards just fall back to not showing
      // an Attendance column at all, rather than breaking the whole page.
      .catch(() => setAttendanceRates(null));
  }, [accessToken, schoolId, filters.yearId, filters.classId, filters.sectionId]);

  async function onExport() {
    if (!accessToken) return;
    setExporting(true);
    try {
      await api.exportStudents(accessToken, schoolId);
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
      const result = await runBulkAction(ids, (id) => studentsApi.archive(accessToken, id));
      setStudents((prev) => prev?.filter((s) => !result.succeededIds.includes(s.studentId)) ?? prev);
      show(summarizeBulkResult(result, "archived"));
      setSelectedIds(new Set());
      setShowBulkConfirm(false);
    } finally {
      setBulkArchiving(false);
    }
  }

  const canCreate = user?.permissions.includes("students.create") ?? false;
  const canArchive = user?.permissions.includes("students.archive") ?? false;
  const canImport = user?.permissions.includes("imports.create") ?? false;
  const canExport = user?.permissions.includes("exports.create") ?? false;
  const canBulkTransfer = (user?.permissions.includes("transfers.create") && user?.permissions.includes("transfers.approve")) ?? false;
  const canSelect = canArchive || canBulkTransfer;
  const schoolName = user?.schools.find((s) => s.id === schoolId)?.name ?? schools?.find((s) => s.id === schoolId)?.name ?? "School";

  // Search and the Attendance category are applied on top of the
  // already-fetched (school + year + class + section) result — every field
  // searched here (name, ID, roll no, parent name/phone) already came back
  // from the database in that same response, so this stays instant without
  // a network round trip per keystroke.
  // The level filter only narrows the Class dropdown's options (see
  // StudentListFilters) — when no specific class is picked yet, the fetch
  // itself has no notion of level, so it must also be applied here or a
  // school-wide "Primary" selection would silently show Secondary students.
  const classIdsForLevel =
    filters.levelFilter === "ALL" ? null : new Set(classes.filter((c) => c.division.type === filters.levelFilter).map((c) => c.id));

  const q = filters.search.trim().toLowerCase();
  const filteredStudents = (students ?? []).filter((s) => {
    if (classIdsForLevel && !classIdsForLevel.has(s.classId)) return false;
    if (q) {
      const haystack = `${s.firstName} ${s.lastName} ${s.studentNumber} ${s.rollNumber} ${s.className} ${s.sectionName} ${s.guardianName ?? ""} ${s.guardianPhone ?? ""}`.toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    if (filters.attendanceFilter !== "ALL" && attendanceRates) {
      const rate = attendanceRates.get(s.enrollmentId);
      if (rate === undefined || rate === null) return false;
      if (filters.attendanceFilter === "EXCELLENT" && rate < 90) return false;
      if (filters.attendanceFilter === "GOOD" && (rate < 75 || rate >= 90)) return false;
      if (filters.attendanceFilter === "NEEDS_ATTENTION" && rate >= 75) return false;
    }
    return true;
  });

  return (
    <div>
      <PageHeader
        eyebrow="Students"
        title={schoolName}
        description="Manage students across classes and sections"
        breadcrumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "Students" }]}
        actions={
          <>
            {canExport && (
              <Button variant="outline" icon={<Download className="size-4" />} loading={exporting} onClick={onExport}>
                Export
              </Button>
            )}
            <Button variant="outline" icon={<Printer className="size-4" />} onClick={() => window.print()}>
              Print
            </Button>
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
      <div className="space-y-5 p-4 sm:p-6">
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
                state={filters}
                onChange={patchFilters}
              />

              <StudentListSummaryCards students={filteredStudents} attendanceRates={attendanceRates} />

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
                      onClick={() => router.push(`/schools/${schoolId}/students/bulk-transfer?studentIds=${[...selectedIds].join(",")}`)}
                    >
                      Bulk Transfer
                    </Button>
                  )}
                </BulkActionBar>
              )}

              <StudentsTable
                schoolId={schoolId}
                accessToken={accessToken}
                students={students ? filteredStudents : null}
                loading={!students}
                attendanceRates={attendanceRates}
                canTransfer={canBulkTransfer}
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
