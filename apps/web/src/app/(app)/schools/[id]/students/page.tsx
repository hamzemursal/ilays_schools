"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { useAuth, ApiError } from "@/lib/auth-context";
import { api, type StudentListItem } from "@/lib/api";
import { studentsApi } from "@/features/students/api";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { BulkActionBar } from "@/components/ui/BulkActionBar";
import { useToast } from "@/components/ui/Toast";
import { runBulkAction, summarizeBulkResult } from "@/lib/bulkAction";
import { StudentsTable } from "@/features/students/tables/StudentsTable";
import { Archive, Download, Upload, UserPlus } from "lucide-react";

export default function StudentsListPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: schoolId } = use(params);
  const { user, accessToken } = useAuth();
  const { show } = useToast();

  const [students, setStudents] = useState<StudentListItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showBulkConfirm, setShowBulkConfirm] = useState(false);
  const [bulkArchiving, setBulkArchiving] = useState(false);

  useEffect(() => {
    if (!accessToken) return;
    api
      .listStudents(accessToken, schoolId)
      .then(setStudents)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load students"));
  }, [accessToken, schoolId]);

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
  const schoolName = user?.schools.find((s) => s.id === schoolId)?.name ?? "School";

  return (
    <div>
      <PageHeader
        eyebrow="Students"
        title={schoolName}
        breadcrumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "Students" }]}
        actions={
          <>
            {canExport && (
              <Button variant="outline" icon={<Download className="size-4" />} loading={exporting} onClick={onExport}>
                Export
              </Button>
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
      <div className="p-4 sm:p-6">
        {error ? (
          <Alert tone="danger">{error}</Alert>
        ) : (
          accessToken && (
            <>
              {canArchive && (
                <BulkActionBar count={selectedIds.size} onClear={() => setSelectedIds(new Set())}>
                  <Button size="sm" variant="danger" icon={<Archive className="size-4" />} onClick={() => setShowBulkConfirm(true)}>
                    Archive selected
                  </Button>
                </BulkActionBar>
              )}
              <StudentsTable
                schoolId={schoolId}
                accessToken={accessToken}
                students={students}
                selection={
                  canArchive
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
