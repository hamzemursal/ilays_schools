"use client";

import { use, useEffect, useState } from "react";
import { useAuth, ApiError } from "@/lib/auth-context";
import { api, type ResultsForSection } from "@/lib/api";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Input } from "@/components/ui/FormControls";
import { SkeletonTable } from "@/components/ui/Skeleton";
import { CheckCircle2 } from "lucide-react";

export default function ResultsPage({
  params,
}: {
  params: Promise<{ id: string; examSubjectId: string; sectionId: string }>;
}) {
  const { id: schoolId, examSubjectId, sectionId } = use(params);
  const { accessToken } = useAuth();

  const [data, setData] = useState<ResultsForSection | null>(null);
  const [pending, setPending] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!accessToken) return;
    api
      .getResults(accessToken, schoolId, examSubjectId, sectionId)
      .then((res) => {
        setData(res);
        setPending(
          Object.fromEntries(
            res.students.filter((s) => s.marksObtained !== null).map((s) => [s.enrollmentId, s.marksObtained!]),
          ),
        );
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load results"));
  }, [accessToken, schoolId, examSubjectId, sectionId]);

  async function save() {
    if (!accessToken || !data) return;
    setSaving(true);
    setError(null);
    try {
      const entries = Object.entries(pending)
        .filter(([, v]) => v.trim() !== "")
        .map(([enrollmentId, v]) => ({ enrollmentId, marksObtained: Number(v) }));
      const updated = await api.enterMarks(accessToken, schoolId, examSubjectId, sectionId, entries);
      setData(updated);
      setSaved(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to save marks");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <PageHeader
        eyebrow="Results"
        title="Enter marks"
        description={data ? `Out of ${data.maxMarks}` : undefined}
        breadcrumbs={[{ label: "My classes", href: "/my-classes" }, { label: "Results" }]}
      />

      <div className="mx-auto max-w-2xl space-y-5 p-4 sm:p-6">
        {error && <Alert tone="danger">{error}</Alert>}

        {!data ? (
          <SkeletonTable rows={5} cols={2} />
        ) : (
          <div className="space-y-2">
            {data.students.map((s) => {
              const isApproved = s.status === "APPROVED";
              return (
                <Card key={s.enrollmentId} padding="sm">
                  <div className="flex flex-col gap-2 p-2 sm:flex-row sm:items-center sm:justify-between">
                    <p className="font-medium text-foreground">
                      <span className="text-foreground-muted">#{s.rollNumber}</span> {s.firstName} {s.lastName}
                    </p>
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        min={0}
                        max={data.maxMarks}
                        value={pending[s.enrollmentId] ?? ""}
                        disabled={isApproved}
                        onChange={(e) => setPending((prev) => ({ ...prev, [s.enrollmentId]: e.target.value }))}
                        className="w-24"
                      />
                      {isApproved ? (
                        <Badge tone="success">Approved</Badge>
                      ) : s.status === "ENTERED" ? (
                        <Badge tone="warning">Entered</Badge>
                      ) : null}
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}

        {data && (
          <div className="flex flex-wrap items-center gap-3">
            <Button icon={<CheckCircle2 className="size-4" />} loading={saving} onClick={save}>
              Save marks
            </Button>
            {saved && <span className="text-sm text-success">Saved.</span>}
          </div>
        )}
      </div>
    </div>
  );
}
