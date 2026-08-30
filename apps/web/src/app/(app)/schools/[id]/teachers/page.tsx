"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { Download, Power, UserPlus } from "lucide-react";
import { useAuth, ApiError } from "@/lib/auth-context";
import { api, type Teacher } from "@/lib/api";
import { teachersApi } from "@/features/teachers/api";
import { TeachersTable } from "@/features/teachers/tables/TeachersTable";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { BulkActionBar } from "@/components/ui/BulkActionBar";
import { useToast } from "@/components/ui/Toast";
import { runBulkAction, summarizeBulkResult } from "@/lib/bulkAction";

export default function TeachersListPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: schoolId } = use(params);
  const { user, accessToken } = useAuth();
  const { show } = useToast();

  const [teachers, setTeachers] = useState<Teacher[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showBulkConfirm, setShowBulkConfirm] = useState(false);
  const [bulkDeactivating, setBulkDeactivating] = useState(false);

  useEffect(() => {
    if (!accessToken) return;
    teachersApi
      .list(accessToken, schoolId)
      .then(setTeachers)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load teachers"));
  }, [accessToken, schoolId]);

  async function onExport() {
    if (!accessToken) return;
    setExporting(true);
    try {
      await api.exportTeachers(accessToken, schoolId);
    } catch (err) {
      show(err instanceof ApiError ? err.message : "Failed to export teachers", "danger");
    } finally {
      setExporting(false);
    }
  }

  async function onBulkDeactivate() {
    if (!accessToken) return;
    setBulkDeactivating(true);
    try {
      const ids = Array.from(selectedIds);
      const result = await runBulkAction(ids, (id) =>
        teachersApi.update(accessToken, schoolId, id, { status: "INACTIVE" }),
      );
      setTeachers((prev) =>
        prev?.map((t) => (result.succeededIds.includes(t.id) ? { ...t, status: "INACTIVE" } : t)) ?? prev,
      );
      show(summarizeBulkResult(result, "deactivated"));
      setSelectedIds(new Set());
      setShowBulkConfirm(false);
    } finally {
      setBulkDeactivating(false);
    }
  }

  const canCreate = user?.permissions.includes("teachers.create") ?? false;
  const canUpdate = user?.permissions.includes("teachers.update") ?? false;
  const canExport = user?.permissions.includes("exports.create") ?? false;
  const schoolName = user?.schools.find((s) => s.id === schoolId)?.name ?? "School";

  return (
    <div>
      <PageHeader
        eyebrow="Teachers"
        title={schoolName}
        breadcrumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "Teachers" }]}
        actions={
          <>
            {canExport && (
              <Button variant="outline" icon={<Download className="size-4" />} loading={exporting} onClick={onExport}>
                Export
              </Button>
            )}
            {canCreate && (
              <Link href={`/schools/${schoolId}/teachers/new`}>
                <Button icon={<UserPlus className="size-4" />}>Add teacher</Button>
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
              {canUpdate && (
                <BulkActionBar count={selectedIds.size} onClear={() => setSelectedIds(new Set())}>
                  <Button size="sm" variant="danger" icon={<Power className="size-4" />} onClick={() => setShowBulkConfirm(true)}>
                    Deactivate selected
                  </Button>
                </BulkActionBar>
              )}
              <TeachersTable
                schoolId={schoolId}
                accessToken={accessToken}
                teachers={teachers}
                selection={
                  canUpdate
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
        title={`Deactivate ${selectedIds.size} teacher${selectedIds.size === 1 ? "" : "s"}?`}
        description="They will lose access to their portal. Their records, assignments, and history are kept."
        confirmLabel="Deactivate"
        loading={bulkDeactivating}
        onConfirm={onBulkDeactivate}
        onCancel={() => setShowBulkConfirm(false)}
      />
    </div>
  );
}
