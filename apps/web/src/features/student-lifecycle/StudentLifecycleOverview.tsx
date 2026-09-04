"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Hourglass, GraduationCap, ArrowLeftRight, CheckCircle2, Award, Users } from "lucide-react";
import { useAuth, ApiError } from "@/lib/auth-context";
import { api, type LifecycleSummary, type School } from "@/lib/api";
import { PageHeader, type Crumb } from "@/components/ui/PageHeader";
import { Alert } from "@/components/ui/Alert";
import { SkeletonCards } from "@/components/ui/Skeleton";
import { WorkflowDiagram } from "./WorkflowDiagram";
import { LifecycleFilterBar } from "./LifecycleFilterBar";
import { PrimarySummaryCard, SecondarySummaryCard } from "./LifecycleSummaryCards";
import { AttentionRequired, type AttentionItem } from "./AttentionRequired";
import { useLifecycleYearFilter } from "./useLifecycleYearFilter";

function basePath(fixedSchoolId?: string) {
  return fixedSchoolId ? `/schools/${fixedSchoolId}/student-lifecycle` : "/student-lifecycle";
}

export function StudentLifecycleOverview({
  fixedSchoolId,
  pageTitle,
  breadcrumbs,
}: {
  fixedSchoolId?: string;
  pageTitle: string;
  breadcrumbs?: Crumb[];
}) {
  const { accessToken } = useAuth();

  const [schools, setSchools] = useState<School[]>([]);
  const [schoolId, setSchoolId] = useState(fixedSchoolId ?? "");
  const year = useLifecycleYearFilter(accessToken, schoolId);
  const [summary, setSummary] = useState<LifecycleSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [pendingTransfers, setPendingTransfers] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken || fixedSchoolId) return;
    api
      .listSchools(accessToken)
      .then(setSchools)
      .catch(() => undefined);
  }, [accessToken, fixedSchoolId]);

  // A new schoolId invalidates the previous pending-transfer count — reset
  // during render (React's own recommended pattern for "adjust state when a
  // value changes") rather than synchronously inside the effect below.
  const [prevSchoolId, setPrevSchoolId] = useState(schoolId);
  if (schoolId !== prevSchoolId) {
    setPrevSchoolId(schoolId);
    if (!schoolId) setPendingTransfers(null);
  }

  const summaryKey = `${schoolId}:${year.value}`;
  const [prevSummaryKey, setPrevSummaryKey] = useState(summaryKey);
  if (summaryKey !== prevSummaryKey) {
    setPrevSummaryKey(summaryKey);
    setLoading(true);
    setError(null);
  }

  useEffect(() => {
    if (!accessToken) return;
    api
      .getLifecycleSummary(accessToken, { schoolId: schoolId || undefined, ...year.asFilters })
      .then(setSummary)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load Student Lifecycle summary"))
      .finally(() => setLoading(false));
    // year.asFilters is derived from year.value, already captured in summaryKey.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken, schoolId, year.value]);

  // Pending-transfer counts are only meaningful for one school at a time —
  // there's no cross-school aggregate endpoint, so "All Schools" simply
  // omits this attention item rather than faking a total.
  useEffect(() => {
    if (!accessToken || !schoolId) return;
    api
      .listTransfers(accessToken, schoolId)
      .then((rows) => setPendingTransfers(rows.filter((t) => t.status === "REQUESTED").length))
      .catch(() => setPendingTransfers(null));
  }, [accessToken, schoolId]);

  function handleReset() {
    if (!fixedSchoolId) setSchoolId("");
    year.setValue("");
  }

  const qsFor = (path: string) => {
    const params = new URLSearchParams();
    if (!fixedSchoolId && schoolId) params.set("schoolId", schoolId);
    if (year.value) {
      if (schoolId) params.set("academicYearId", year.value);
      else params.set("academicYearName", year.value);
    }
    const q = params.toString();
    return `${basePath(fixedSchoolId)}/${path}${q ? `?${q}` : ""}`;
  };

  const graduationPendingHref = (() => {
    const href = qsFor("secondary-graduated");
    return `${href}${href.includes("?") ? "&" : "?"}status=PENDING`;
  })();

  const attentionItems: AttentionItem[] = [
    { icon: Hourglass, label: "Students awaiting Form 1 enrollment", count: summary?.primary.awaitingForm1 ?? 0, href: qsFor("awaiting-enrollment") },
    {
      icon: GraduationCap,
      label: "Pending graduation processing",
      count: summary?.secondary.graduationPending ?? 0,
      href: graduationPendingHref,
    },
    ...(pendingTransfers !== null
      ? [{ icon: ArrowLeftRight, label: "Pending transfer requests", count: pendingTransfers, href: `/schools/${schoolId}/transfers` }]
      : []),
  ];

  const canStartTransition = !!schoolId;

  return (
    <div>
      <PageHeader
        eyebrow="Student Lifecycle"
        title={pageTitle}
        description="Track students through Primary completion, Form 1 transition, and Secondary graduation."
        breadcrumbs={breadcrumbs}
      />

      <div className="space-y-6 p-4 sm:p-6">
        <WorkflowDiagram />

        <LifecycleFilterBar
          schools={fixedSchoolId ? undefined : schools.map((s) => ({ id: s.id, name: s.name }))}
          schoolId={schoolId}
          onSchoolChange={setSchoolId}
          academicYearOptions={year.options}
          academicYearValue={year.value}
          onAcademicYearChange={year.setValue}
          onReset={handleReset}
        />

        {error && <Alert tone="danger">{error}</Alert>}

        <div>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-foreground-muted">Attention Required</h2>
          {loading ? <SkeletonCards count={3} /> : <AttentionRequired items={attentionItems} />}
        </div>

        {loading ? (
          <SkeletonCards count={6} />
        ) : (
          <>
            <PrimarySummaryCard summary={summary?.primary ?? null} loading={loading} />
            <SecondarySummaryCard summary={summary?.secondary ?? null} loading={loading} />
          </>
        )}

        <div>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-foreground-muted">Pages</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <QuickLink icon={CheckCircle2} label="Primary Completed" href={qsFor("primary-completed")} />
            <QuickLink icon={Hourglass} label="Awaiting Enrollment" href={qsFor("awaiting-enrollment")} />
            <QuickLink
              icon={ArrowRight}
              label="Form 1 Transition"
              href={schoolId ? `/schools/${schoolId}/student-lifecycle/form-1-transition` : "#"}
              disabled={!canStartTransition}
              disabledHint="Select a school above to start a transition"
            />
            <QuickLink icon={GraduationCap} label="Secondary Graduated" href={qsFor("secondary-graduated")} />
            <QuickLink icon={Award} label="Alumni" href={qsFor("alumni")} />
            <QuickLink icon={Users} label="All Students" href={schoolId ? `/schools/${schoolId}/students` : "/schools"} />
          </div>
        </div>
      </div>
    </div>
  );
}

function QuickLink({
  icon: Icon,
  label,
  href,
  disabled,
  disabledHint,
}: {
  icon: typeof ArrowRight;
  label: string;
  href: string;
  disabled?: boolean;
  disabledHint?: string;
}) {
  if (disabled) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-border bg-surface p-4 opacity-60" title={disabledHint}>
        <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-background text-foreground-muted">
          <Icon className="size-4.5" />
        </div>
        <span className="text-sm font-medium text-foreground-muted">{label}</span>
      </div>
    );
  }
  return (
    <Link
      href={href}
      className="flex items-center gap-3 rounded-xl border border-border bg-background p-4 shadow-sm transition-colors hover:border-accent"
    >
      <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent">
        <Icon className="size-4.5" />
      </div>
      <span className="flex-1 text-sm font-medium text-foreground">{label}</span>
      <ArrowRight className="size-4 shrink-0 text-foreground-muted" />
    </Link>
  );
}
