"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Award, CheckCircle2, CircleDashed, Flag, GraduationCap, ListChecks, PlayCircle } from "lucide-react";
import { ApiError, useAuth } from "@/lib/auth-context";
import { api, type AcademicYear, type ProgressionOverview, type ProgressionOverviewClass } from "@/lib/api";
import { Alert } from "@/components/ui/Alert";
import { EmptyState } from "@/components/ui/EmptyState";
import { SkeletonCards } from "@/components/ui/Skeleton";
import { Select } from "@/components/ui/FormControls";

// Year-End Progression landing — one card per class of the chosen academic
// year. Status is derived only from real enrollment counts (see
// PromotionsService.overview): nothing here guesses at results.
export type ProgressionStatus = "NOT_STARTED" | "READY" | "NEEDS_DECISIONS" | "COMPLETED";

export function progressionStatus(c: Pick<ProgressionOverviewClass, "activeCount" | "progressedCount">): ProgressionStatus {
  if (c.activeCount === 0) return c.progressedCount > 0 ? "COMPLETED" : "NOT_STARTED";
  return c.progressedCount > 0 ? "NEEDS_DECISIONS" : "READY";
}

const STATUS_META: Record<ProgressionStatus, { label: string; className: string; icon: typeof CheckCircle2; hint: string }> = {
  NOT_STARTED: { label: "Not Started", className: "bg-surface-soft text-foreground-muted", icon: CircleDashed, hint: "No students enrolled yet" },
  READY: { label: "Ready", className: "bg-accent-soft text-accent", icon: PlayCircle, hint: "Ready to progress" },
  NEEDS_DECISIONS: { label: "Needs Decisions", className: "bg-warning-soft text-warning", icon: ListChecks, hint: "Some students still to progress" },
  COMPLETED: { label: "Completed", className: "bg-success-soft text-success", icon: CheckCircle2, hint: "Everyone has been progressed" },
};

export function progressionHref(schoolId: string, yearId: string, c: ProgressionOverviewClass): string {
  if (c.isFinal) {
    return `/schools/${schoolId}/promotions/${c.divisionType === "PRIMARY" ? "class-8" : "form-4"}?academicYearId=${yearId}`;
  }
  return `/schools/${schoolId}/promotions/promote?academicYearId=${yearId}&classId=${c.id}`;
}

function ClassCard({ schoolId, yearId, c }: { schoolId: string; yearId: string; c: ProgressionOverviewClass }) {
  const status = progressionStatus(c);
  const meta = STATUS_META[status];
  const StatusIcon = meta.icon;
  const total = c.activeCount + c.progressedCount;
  const done = total > 0 ? Math.round((c.progressedCount / total) * 100) : 0;
  const finalLabel = c.divisionType === "PRIMARY" ? "Class 8 → Form 1" : "Graduation";
  const body = (
    <>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="truncate text-base font-semibold text-foreground">{c.name}</h3>
          <p className="mt-0.5 text-xs text-foreground-muted">
            {c.sections.length} section{c.sections.length === 1 ? "" : "s"}
          </p>
        </div>
        {c.isFinal && (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-accent px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white">
            <Flag className="size-3" /> Final class
          </span>
        )}
      </div>

      <p className="mt-4 text-3xl font-semibold tabular-nums text-foreground">
        {c.activeCount}
        <span className="ml-1.5 text-sm font-normal text-foreground-soft">active student{c.activeCount === 1 ? "" : "s"}</span>
      </p>

      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-surface-soft" aria-hidden>
        <div className="h-full rounded-full bg-success transition-all" style={{ width: `${done}%` }} />
      </div>

      <div className="mt-3 flex items-center justify-between gap-2">
        <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${meta.className}`} title={meta.hint}>
          <StatusIcon className="size-3.5" /> {meta.label}
        </span>
        {c.activeCount > 0 && (
          <span className="flex items-center gap-1 text-xs font-medium text-accent">
            {c.isFinal ? finalLabel : "Promote"} <ArrowRight className="size-3.5" />
          </span>
        )}
      </div>
    </>
  );
  const base = `block rounded-xl border bg-background p-5 shadow-sm transition-all ${
    c.isFinal ? "border-accent/40" : "border-border"
  }`;
  return c.activeCount > 0 ? (
    <Link href={progressionHref(schoolId, yearId, c)} className={`${base} hover:-translate-y-0.5 hover:border-accent hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40`}>
      {body}
    </Link>
  ) : (
    <div className={`${base} opacity-80`}>{body}</div>
  );
}

export function ProgressionLanding({ schoolId }: { schoolId: string }) {
  const { accessToken } = useAuth();
  const [years, setYears] = useState<AcademicYear[]>([]);
  const [yearId, setYearId] = useState("");
  // Keyed by the year it was loaded for, so switching year shows the skeleton
  // without resetting state inside the effect.
  const [loaded, setLoaded] = useState<{ yearId: string; overview: ProgressionOverview } | null>(null);
  const overview = loaded?.yearId === yearId ? loaded.overview : null;
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken) return;
    api
      .listAcademicYears(accessToken, schoolId)
      .then((y) => {
        setYears(y);
        setYearId((y.find((yr) => yr.isCurrent) ?? y[0])?.id ?? "");
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load academic years"));
  }, [accessToken, schoolId]);

  useEffect(() => {
    if (!accessToken || !yearId) return;
    let cancelled = false;
    api
      .getProgressionOverview(accessToken, schoolId, yearId)
      .then((o) => !cancelled && setLoaded({ yearId, overview: o }))
      .catch((err) => !cancelled && setError(err instanceof ApiError ? err.message : "Failed to load classes"));
    return () => {
      cancelled = true;
    };
  }, [accessToken, schoolId, yearId]);

  if (error) return <Alert tone="danger">{error}</Alert>;

  const groups: { key: "PRIMARY" | "SECONDARY"; title: string; icon: typeof GraduationCap }[] = [
    { key: "PRIMARY", title: "Primary", icon: GraduationCap },
    { key: "SECONDARY", title: "Secondary", icon: Award },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <label htmlFor="progression-year" className="mb-1 block text-xs font-medium text-foreground-soft">
            Academic year
          </label>
          <Select id="progression-year" value={yearId} onChange={(e) => setYearId(e.target.value)} className="w-56">
            {years.map((y) => (
              <option key={y.id} value={y.id}>
                {y.name}
                {y.isCurrent ? " (current)" : ""}
              </option>
            ))}
          </Select>
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          {(Object.keys(STATUS_META) as ProgressionStatus[]).map((s) => {
            const Icon = STATUS_META[s].icon;
            return (
              <span key={s} className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 font-medium ${STATUS_META[s].className}`}>
                <Icon className="size-3.5" /> {STATUS_META[s].label}
              </span>
            );
          })}
        </div>
      </div>

      {!overview ? (
        <SkeletonCards count={6} />
      ) : overview.classes.length === 0 ? (
        <EmptyState icon={GraduationCap} title="No classes in this year" description="Create the classes for this academic year first (Academic → Classes)." />
      ) : (
        groups.map((g) => {
          const classes = overview.classes.filter((c) => c.divisionType === g.key);
          if (classes.length === 0) return null;
          const GroupIcon = g.icon;
          return (
            <section key={g.key} aria-label={g.title}>
              <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-foreground-soft">
                <GroupIcon className="size-4 text-accent" /> {g.title}
              </h2>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {classes.map((c) => (
                  <ClassCard key={c.id} schoolId={schoolId} yearId={yearId} c={c} />
                ))}
              </div>
            </section>
          );
        })
      )}
    </div>
  );
}
