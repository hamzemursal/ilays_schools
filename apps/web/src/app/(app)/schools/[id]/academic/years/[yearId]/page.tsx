"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { useAuth, ApiError } from "@/lib/auth-context";
import { api, type AcademicYear, type ClassWithSections } from "@/lib/api";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Alert } from "@/components/ui/Alert";
import { EmptyState } from "@/components/ui/EmptyState";
import { SkeletonCards } from "@/components/ui/Skeleton";
import { Button } from "@/components/ui/Button";
import { CalendarDays, ChevronRight, GraduationCap, Plus } from "lucide-react";
import { TermWeightsEditor } from "../../page";

// One academic year's own page — strictly scoped to the single year
// resolved below (via the school's existing "resolve by identifier"
// endpoint, the same one every "?year=" link elsewhere in Academic already
// uses), never mixed with another year's data. This is the entry point for
// this year's own academic structure: Primary/Secondary -> Class/Form ->
// Sections, all reusing the existing year-aware listClasses() call and the
// existing (already year-scoped) class-detail/section-workspace pages —
// nothing new is built for those, only linked into with this year's id.
// Subjects and Exams for this year remain out of scope here.
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

        <YearClassesSection schoolId={schoolId} accessToken={accessToken!} year={year} canManage={canManage} />
      </div>
    </div>
  );
}

// This year's own academic structure: Primary/Secondary -> Class/Form ->
// Sections. The one API call is scoped by this exact year's id (never a
// global/default year), so a class from any other academic year can never
// appear here, regardless of which year is "current" elsewhere in the app.
function YearClassesSection({
  schoolId,
  accessToken,
  year,
  canManage,
}: {
  schoolId: string;
  accessToken: string;
  year: AcademicYear;
  canManage: boolean;
}) {
  const [classes, setClasses] = useState<ClassWithSections[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken) return;
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setClasses(null);
    setError(null);
    api
      .listClasses(accessToken, schoolId, year.id)
      .then((list) => {
        if (!cancelled) setClasses(list);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof ApiError ? err.message : "Failed to load classes for this academic year");
      });
    return () => {
      cancelled = true;
    };
  }, [accessToken, schoolId, year.id]);

  return (
    <Card padding="none">
      <CardHeader
        title="Classes & Sections"
        description={`Only classes that belong to ${year.name}.`}
        actions={
          canManage && (
            <Link href={`/schools/${schoolId}/academic/classes/new`}>
              <Button size="sm" icon={<Plus className="size-4" />}>
                Create class
              </Button>
            </Link>
          )
        }
      />
      <div className="p-5">
        {error ? (
          <Alert tone="danger">{error}</Alert>
        ) : !classes ? (
          <SkeletonCards count={2} />
        ) : classes.length === 0 ? (
          <EmptyState
            icon={GraduationCap}
            title="No classes yet for this year"
            description={`Nothing has been created for ${year.name} yet.`}
            action={
              canManage && (
                <Link href={`/schools/${schoolId}/academic/classes/new`}>
                  <Button size="sm" icon={<Plus className="size-4" />}>
                    Create class
                  </Button>
                </Link>
              )
            }
          />
        ) : (
          <div className="space-y-8">
            {(["SECONDARY", "PRIMARY"] as const).map((divisionType) => {
              const group = classes
                .filter((c) => c.division.type === divisionType)
                .sort((a, b) => a.level - b.level);
              if (group.length === 0) return null;
              return (
                <div key={divisionType}>
                  <h3 className="mb-3 text-sm font-semibold text-foreground">
                    {divisionType === "SECONDARY" ? "Secondary" : "Primary"}
                  </h3>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                    {group.map((cls) => (
                      <ClassSummaryCard key={cls.id} cls={cls} schoolId={schoolId} yearId={year.id} />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Card>
  );
}

// A read-focused summary card — day-to-day class management (rename,
// delete, sections, subjects, teachers) still lives on the class's own
// detail page, unchanged. Clicking opens the existing (already year-aware)
// class detail page with
// this exact year's id, so Sections/Students/Subjects there stay scoped to
// the same year the admin was just looking at, never silently defaulting
// to whichever year happens to be current.
function ClassSummaryCard({ cls, schoolId, yearId }: { cls: ClassWithSections; schoolId: string; yearId: string }) {
  const isSecondary = cls.division.type === "SECONDARY";
  const href = `/schools/${schoolId}/academic/classes/${cls.id}?year=${yearId}`;

  return (
    <Link href={href} className="block">
      <Card className="flex h-full flex-col transition-colors hover:border-accent/40">
        <div className="flex items-center gap-2.5">
          <div
            className={`flex size-9 shrink-0 items-center justify-center rounded-xl ${
              isSecondary ? "bg-accent-soft text-accent" : "bg-success-soft text-success"
            }`}
          >
            <GraduationCap className="size-4.5" />
          </div>
          <p className="truncate font-semibold text-foreground">{cls.name}</p>
        </div>
        <div className="mt-3 flex items-center justify-between text-sm text-foreground-soft">
          <span>
            {cls.sections.length} Section{cls.sections.length === 1 ? "" : "s"}
          </span>
          <ChevronRight className="size-4 text-foreground-muted" />
        </div>
      </Card>
    </Link>
  );
}
