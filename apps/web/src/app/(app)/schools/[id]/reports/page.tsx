"use client";

import { use, useEffect, useState } from "react";
import { useAuth, ApiError } from "@/lib/auth-context";
import { api, type AcademicYear, type AttendanceReportRow, type EnrollmentReportRow } from "@/lib/api";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardHeader } from "@/components/ui/Card";
import { Alert } from "@/components/ui/Alert";
import { EmptyState } from "@/components/ui/EmptyState";
import { FormField, Input, Select } from "@/components/ui/FormControls";
import { SkeletonTable } from "@/components/ui/Skeleton";
import { BarChart3, ClipboardCheck } from "lucide-react";

// Deliberately two focused tables, not a full reporting engine — real data,
// aggregated server-side (ReportsService), reusing StudentEnrollment and
// Attendance exactly as the rest of the app does.
export default function ReportsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: schoolId } = use(params);
  const { accessToken } = useAuth();

  const [years, setYears] = useState<AcademicYear[] | null>(null);
  const [academicYearId, setAcademicYearId] = useState("");
  const [enrollment, setEnrollment] = useState<EnrollmentReportRow[] | null>(null);
  const [attendance, setAttendance] = useState<AttendanceReportRow[] | null>(null);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [error, setError] = useState<string | null>(null);

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
      .then(setEnrollment)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load enrollment report"));
  }, [accessToken, schoolId, academicYearId]);

  useEffect(() => {
    if (!accessToken || !academicYearId) return;
    api
      .getAttendanceReport(accessToken, schoolId, academicYearId, from || undefined, to || undefined)
      .then(setAttendance)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load attendance report"));
  }, [accessToken, schoolId, academicYearId, from, to]);

  return (
    <div>
      <PageHeader
        eyebrow="Reports"
        title="Reports"
        description="Enrollment and attendance summaries for your school."
        breadcrumbs={[{ label: "Dashboard", href: `/schools/${schoolId}/dashboard` }, { label: "Reports" }]}
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
        {error && <Alert tone="danger">{error}</Alert>}

        {years && years.length === 0 ? (
          <Card padding="none">
            <div className="p-5">
              <EmptyState
                icon={BarChart3}
                title="No academic year yet"
                description="Create an academic year in Academic before reports have anything to show."
              />
            </div>
          </Card>
        ) : (
          <>
        <Card padding="none">
          <CardHeader title="Enrollment by class" description="Active students per class and section." />
          {!enrollment ? (
            <div className="p-5">
              <SkeletonTable rows={4} cols={3} />
            </div>
          ) : enrollment.length === 0 ? (
            <div className="p-5">
              <EmptyState icon={BarChart3} title="No classes yet" description="Set up classes in Academic first." />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[480px] text-left text-sm">
                <thead className="bg-surface-soft text-xs font-semibold uppercase tracking-wide text-foreground-muted">
                  <tr>
                    <th className="px-5 py-2.5">Class</th>
                    <th className="px-5 py-2.5">Sections</th>
                    <th className="px-5 py-2.5">Total enrolled</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {enrollment.map((row) => (
                    <tr key={row.classId}>
                      <td className="px-5 py-3 font-medium text-foreground">{row.className}</td>
                      <td className="px-5 py-3 text-foreground-soft">
                        {row.sections.length === 0
                          ? "—"
                          : row.sections.map((s) => `${s.sectionName} (${s.enrolled})`).join(", ")}
                      </td>
                      <td className="px-5 py-3 font-medium text-foreground">{row.totalEnrolled}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card padding="none">
          <CardHeader
            title="Attendance by section"
            description="Leave the date range empty for all-time totals."
            actions={
              <div className="flex flex-wrap items-end gap-2">
                <FormField label="From" className="w-auto">
                  <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
                </FormField>
                <FormField label="To" className="w-auto">
                  <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
                </FormField>
              </div>
            }
          />
          {!attendance ? (
            <div className="p-5">
              <SkeletonTable rows={4} cols={5} />
            </div>
          ) : attendance.length === 0 ? (
            <div className="p-5">
              <EmptyState icon={ClipboardCheck} title="No sections yet" description="Set up sections in Academic first." />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] text-left text-sm">
                <thead className="bg-surface-soft text-xs font-semibold uppercase tracking-wide text-foreground-muted">
                  <tr>
                    <th className="px-5 py-2.5">Class · Section</th>
                    <th className="px-5 py-2.5">Present</th>
                    <th className="px-5 py-2.5">Absent</th>
                    <th className="px-5 py-2.5">Late</th>
                    <th className="px-5 py-2.5">Excused</th>
                    <th className="px-5 py-2.5">Total marked</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {attendance.map((row) => (
                    <tr key={row.sectionId}>
                      <td className="px-5 py-3 font-medium text-foreground">
                        {row.className} · {row.sectionName}
                      </td>
                      <td className="px-5 py-3 text-success">{row.present}</td>
                      <td className="px-5 py-3 text-danger">{row.absent}</td>
                      <td className="px-5 py-3 text-warning">{row.late}</td>
                      <td className="px-5 py-3 text-accent">{row.excused}</td>
                      <td className="px-5 py-3 text-foreground-soft">{row.total}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
          </>
        )}
      </div>
    </div>
  );
}
