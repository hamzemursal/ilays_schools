"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Archive, Plus, RotateCcw } from "lucide-react";
import type { Department } from "@/lib/api";
import { ApiError } from "@/lib/auth-context";
import { departmentsApi } from "../api";
import { Card, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/FormControls";
import { Badge } from "@/components/ui/Badge";
import { Alert } from "@/components/ui/Alert";
import { EmptyState } from "@/components/ui/EmptyState";
import { useToast } from "@/components/ui/Toast";

export function DepartmentsManager({
  accessToken,
  schoolId,
  canManage,
}: {
  accessToken: string;
  schoolId: string;
  canManage: boolean;
}) {
  const { show } = useToast();
  const [departments, setDepartments] = useState<Department[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);

  function load() {
    departmentsApi
      .list(accessToken, schoolId)
      .then(setDepartments)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load departments"));
  }

  useEffect(load, [accessToken, schoolId]);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setCreating(true);
    try {
      await departmentsApi.create(accessToken, schoolId, { name: name.trim() });
      setName("");
      load();
      show("Department added.");
    } catch (err) {
      show(err instanceof ApiError ? err.message : "Failed to add department", "danger");
    } finally {
      setCreating(false);
    }
  }

  async function onToggleArchive(dept: Department) {
    try {
      await departmentsApi.update(accessToken, schoolId, dept.id, {
        status: dept.status === "ARCHIVED" ? "ACTIVE" : "ARCHIVED",
      });
      load();
      show(dept.status === "ARCHIVED" ? "Department restored." : "Department archived.");
    } catch (err) {
      show(err instanceof ApiError ? err.message : "Failed to update department", "danger");
    }
  }

  return (
    <Card padding="none">
      <CardHeader
        title="Departments"
        description="Configurable per this school — used to group staff members. Archiving keeps history intact."
      />
      <div className="p-5">
        {error && <Alert tone="danger">{error}</Alert>}

        {canManage && (
          <form onSubmit={onCreate} className="mb-4 flex gap-2">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Administration, Finance, Reception"
              className="max-w-xs"
            />
            <Button type="submit" size="sm" icon={<Plus className="size-4" />} loading={creating} disabled={!name.trim()}>
              Add
            </Button>
          </form>
        )}

        {!departments ? (
          <p className="text-sm text-foreground-muted">Loading…</p>
        ) : departments.length === 0 ? (
          <EmptyState title="No departments yet" description="Add one above to start organizing staff." />
        ) : (
          <ul className="divide-y divide-border">
            {departments.map((d) => (
              <li key={d.id} className="flex items-center justify-between py-2.5">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-foreground">{d.name}</span>
                  {d.status === "ARCHIVED" && <Badge tone="neutral">Archived</Badge>}
                </div>
                {canManage && (
                  <Button
                    size="sm"
                    variant="ghost"
                    icon={d.status === "ARCHIVED" ? <RotateCcw className="size-4" /> : <Archive className="size-4" />}
                    onClick={() => onToggleArchive(d)}
                  >
                    {d.status === "ARCHIVED" ? "Restore" : "Archive"}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}
