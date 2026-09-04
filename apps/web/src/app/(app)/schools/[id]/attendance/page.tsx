"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { useAuth, ApiError } from "@/lib/auth-context";
import { api, type AcademicYear, type AttendanceStatusForDate, type EnrollmentReportRow } from "@/lib/api";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardHeader } from "@/components/ui/Card";
import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { Select } from "@/components/ui/FormControls";
import { SkeletonCards } from "@/components/ui/Skeleton";
import { ClipboardCheck, Users } from "lucide-react";

// The School Admin's entry point into attendance — browses every class and
// section in the school (unlike a teacher's My Classes, which only shows
// their own assignments) and hands off to the same shared attendance page,
// so marking/reviewing logic is never duplicated.
export default function AdminAttendancePage({ params }: { params: Promise<{ id: string }> }) {
  const { id: schoolId } = use(params);
  const { accessToken } = useAuth();

  const [years, setYears] = useState<AcademicYear[] | null>(null);
  const [academicYearId, setAcademicYearId] = useState("");
  const [rows, setRows] = useState<EnrollmentReportRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [todayStatus, setTodayStatus] = useState<AttendanceStatusForDate | null>(null);

  useEffect(() => {
    if (!accessToken) return;
    api
      .listAcademicYears(accessToken, schoolId)
      .then((list) => {
        setYears(list);
        const current = list.find((y) => y.isCurrent) ?? list[0];
        if (current) setAcademicYearId(current.id);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load academic years"));
  }, [accessToken, schoolId]);

  useEffect(() => {
    if (!accessToken || !academicYearId) return;
    api
      .getEnrollmentReport(accessToken, schoolId, academicYearId)
      .then(setRows)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load classes"));
  }, [accessToken, schoolId, academicYearId]);

  const today = new Date().toISOString().slice(0, 10);

  // Lets each section card show whether today has already been marked,
  // instead of making an admin open every section just to find out.
  useEffect(() => {
    if (!accessToken) return;
    api
      .getAttendanceStatusForDate(accessToken, schoolId, today)
      .then(setTodayStatus)
      .catch(() => setTodayStatus(null));
  }, [accessToken, schoolId, today]);
  const yearName = years?.find((y) => y.id === academicYearId)?.name ?? "";

  function attendanceUrl(className: string, sectionId: string, sectionName: string) {
    const query = new URLSearchParams({
      date: today,
      year: yearName,
      class: className,
      section: sectionName,
      backHref: `/schools/${schoolId}/attendance`,
      backLabel: "Attendance",
    });
    return `/schools/${schoolId}/sections/${sectionId}/attendance?${query.toString()}`;
  }

  return (
    <div>
      <PageHeader
        eyebrow="Attendance"
        title="Attendance"
        description="Pick a class and section to mark or review attendance."
        breadcrumbs={[{ label: "Dashboard", href: `/schools/${schoolId}/dashboard` }, { label: "Attendance" }]}
        actions={
          years && years.length > 0 && (
            <Select value={academicYearId} onChange={(e) => setAcademicYearId(e.target.value)} className="w-auto">
              {years.map((y) => (
                <option key={y.id} value={y.id}>
                  {y.name}
                  {y.isCurrent ? " (current)" : ""}
                </option>
              ))}
            </Select>
          )
        }
      />

      <div className="space-y-5 p-4 sm:p-6">
        {error ? (
          <Alert tone="danger">{error}</Alert>
        ) : !years ? (
          <SkeletonCards count={3} />
        ) : years.length === 0 ? (
          <EmptyState
            icon={ClipboardCheck}
            title="No academic year yet"
            description="Create an academic year in Academic before you can take attendance."
          />
        ) : !rows ? (
          <SkeletonCards count={3} />
        ) : rows.length === 0 ? (
          <EmptyState icon={ClipboardCheck} title="No classes yet" description="Set up classes and sections in Academic first." />
        ) : (
          rows.map((cls) => (
            <Card key={cls.classId} padding="none">
              <CardHeader title={cls.className} description={`${cls.totalEnrolled} student(s) enrolled`} />
              <div className="grid gap-2 p-5 sm:grid-cols-2 lg:grid-cols-3">
                {cls.sections.length === 0 ? (
                  <p className="text-sm text-foreground-muted">No sections yet.</p>
                ) : (
                  cls.sections.map((s) => {
                    const isMarked = todayStatus?.markedSectionIds.includes(s.sectionId) ?? false;
                    const isDraft = !isMarked && (todayStatus?.draftSectionIds.includes(s.sectionId) ?? false);
                    return (
                    <Link key={s.sectionId} href={attendanceUrl(cls.className, s.sectionId, s.sectionName)}>
                      <Card padding="sm" className="transition-colors hover:border-accent">
                        <div className="flex items-center justify-between gap-2">
                          <p className="font-medium text-foreground">Section {s.sectionName}</p>
                          {isMarked ? (
                            <Badge tone="success">Marked today</Badge>
                          ) : isDraft ? (
                            <Badge tone="warning">Draft</Badge>
                          ) : (
                            <Badge tone="neutral">Not marked</Badge>
                          )}
                        </div>
                        <p className="flex items-center gap-1.5 text-sm text-foreground-soft">
                          <Users className="size-3.5" /> {s.enrolled} student(s)
                        </p>
                      </Card>
                    </Link>
                    );
                  })
                )}
              </div>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
