"use client";

import { use, useEffect, useState } from "react";
import { useAuth, ApiError } from "@/lib/auth-context";
import { api, type AcademicYear } from "@/lib/api";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Alert } from "@/components/ui/Alert";
import { SkeletonCards } from "@/components/ui/Skeleton";
import { CalendarDays } from "lucide-react";
import { TermWeightsEditor } from "../../page";

// One academic year's own page — strictly scoped to the single year
// resolved below (via the school's existing "resolve by identifier"
// endpoint, the same one every "?year=" link elsewhere in Academic already
// uses), never mixed with another year's data. Classes, Sections, Subjects
// and Exams for this year are deliberately out of scope here — this page
// only carries what the Academic Years card itself already showed, now in
// its own dedicated view.
export default function AcademicYearDetailPage({ params }: { params: Promise<{ id: string; yearId: string }> }) {
  const { id: schoolId, yearId } = use(params);
  const { user, accessToken } = useAuth();

  const [year, setYear] = useState<AcademicYear | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken) return;
    let cancelled = false;
    // Reset on every fresh navigation (not just unmount) — switching
    // straight from one year's clean URL to another must never briefly
    // show the previous year's now-stale data.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setYear(null);
    setError(null);
    api
      .resolveAcademicYear(accessToken, schoolId, yearId)
      .then((y) => {
        if (!cancelled) setYear(y);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof ApiError ? err.message : "Academic year not found");
      });
    return () => {
      cancelled = true;
    };
  }, [accessToken, schoolId, yearId]);

  const canManage = user?.permissions.includes("academic.manage") ?? false;

  if (error) {
    return (
      <div className="p-4 sm:p-6">
        <Alert tone="danger">{error}</Alert>
      </div>
    );
  }
  if (!year) {
    return (
      <div className="p-4 sm:p-6">
        <SkeletonCards count={2} />
      </div>
    );
  }

  const isCurrent = year.isCurrent;

  return (
    <div>
      <PageHeader
        eyebrow="Academic year"
        title={year.name}
        breadcrumbs={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Academic", href: `/schools/${schoolId}/academic?tab=Years` },
          { label: year.name },
        ]}
      />

      <div className="space-y-5 p-4 sm:p-6">
        <Card padding="none" className="overflow-hidden">
          <div className="flex items-start gap-3 p-5">
            <div
              className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${
                isCurrent ? "bg-accent text-white" : "bg-surface text-foreground-muted"
              }`}
            >
              <CalendarDays className="size-5" />
            </div>
            <div className="min-w-0">
              <Badge tone={isCurrent ? "success" : "neutral"}>{isCurrent ? "Current Year" : "Previous Year"}</Badge>
              <p className="mt-1.5 text-lg font-semibold text-foreground">{year.name}</p>
              <p className="text-sm text-foreground-soft">
                {new Date(year.startDate).toLocaleDateString()} – {new Date(year.endDate).toLocaleDateString()}
              </p>
            </div>
          </div>

          <TermWeightsEditor schoolId={schoolId} accessToken={accessToken!} year={year} canManage={canManage} onSaved={setYear} />
        </Card>
      </div>
    </div>
  );
}
