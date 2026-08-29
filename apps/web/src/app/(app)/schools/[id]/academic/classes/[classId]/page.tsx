"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { useAuth, ApiError } from "@/lib/auth-context";
import {
  api,
  type AcademicYear,
  type ClassSubjectRecord,
  type ClassWithSections,
  type Section,
  type SectionTeacherAssignment,
} from "@/lib/api";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Alert } from "@/components/ui/Alert";
import { EmptyState } from "@/components/ui/EmptyState";
import { Select } from "@/components/ui/FormControls";
import { SkeletonCards } from "@/components/ui/Skeleton";
import { GraduationCap } from "lucide-react";

export default function ClassDetailPage({ params }: { params: Promise<{ id: string; classId: string }> }) {
  const { id: schoolId, classId } = use(params);
  const { user, accessToken } = useAuth();

  const [cls, setCls] = useState<ClassWithSections | null>(null);
  const [sections, setSections] = useState<Section[] | null>(null);
  const [subjects, setSubjects] = useState<ClassSubjectRecord[] | null>(null);
  const [years, setYears] = useState<AcademicYear[]>([]);
  const [yearId, setYearId] = useState("");
  const [assignmentsBySection, setAssignmentsBySection] = useState<Record<string, SectionTeacherAssignment[]>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken) return;
    Promise.all([
      api.listClasses(accessToken, schoolId),
      api.listSections(accessToken, schoolId, classId),
      api.listClassSubjects(accessToken, schoolId, classId),
      api.listAcademicYears(accessToken, schoolId),
    ])
      .then(([classes, secs, subs, y]) => {
        const found = classes.find((c) => c.id === classId);
        if (!found) {
          setError("Class not found");
          return;
        }
        setCls(found);
        setSections(secs);
        setSubjects(subs);
        setYears(y);
        const current = y.find((yr) => yr.isCurrent) ?? y[0];
        if (current) setYearId(current.id);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load class"));
  }, [accessToken, schoolId, classId]);

  useEffect(() => {
    if (!accessToken || !sections || !yearId) return;
    Promise.all(
      sections.map((s) =>
        api
          .listSectionTeacherAssignments(accessToken, schoolId, classId, s.id, yearId)
          .then((rows) => [s.id, rows] as const),
      ),
    ).then((entries) => setAssignmentsBySection(Object.fromEntries(entries)));
  }, [accessToken, schoolId, classId, sections, yearId]);

  const schoolName = user?.schools.find((s) => s.id === schoolId)?.name ?? "School";

  if (error) {
    return (
      <div className="p-4 sm:p-6">
        <Alert tone="danger">{error}</Alert>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        eyebrow="Class"
        title={cls ? cls.name : "Loading…"}
        description={cls ? `${cls.division.type} · Level ${cls.level}` : undefined}
        breadcrumbs={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Academic", href: `/schools/${schoolId}/academic` },
          { label: schoolName },
        ]}
      />

      <div className="space-y-5 p-4 sm:p-6">
        {!cls || !sections || !subjects ? (
          <SkeletonCards count={3} />
        ) : (
          <>
            <Card padding="none">
              <CardHeader title="Sections" description={`${sections.length} section(s) in this class.`} />
              {sections.length === 0 ? (
                <div className="p-5">
                  <EmptyState icon={GraduationCap} title="No sections yet" description="Add a section from the Academic page." />
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[480px] text-left text-sm">
                    <thead className="bg-surface-soft text-xs font-semibold uppercase tracking-wide text-foreground-muted">
                      <tr>
                        <th className="px-5 py-2.5">Section</th>
                        <th className="px-5 py-2.5">Capacity</th>
                        <th className="px-5 py-2.5">Enrolled</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {sections.map((s) => (
                        <tr key={s.id}>
                          <td className="px-5 py-3 font-medium text-foreground">{s.name}</td>
                          <td className="px-5 py-3 text-foreground-soft">{s.capacity}</td>
                          <td className="px-5 py-3 text-foreground-soft">{s._count.enrollments}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>

            <Card padding="none">
              <CardHeader title="Subjects taught" />
              <div className="p-5">
                {subjects.length === 0 ? (
                  <p className="text-sm text-foreground-muted">No subjects assigned yet.</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {subjects.map((cs) => (
                      <Link key={cs.subjectId} href={`/schools/${schoolId}/academic/subjects/${cs.subjectId}`}>
                        <Badge tone="accent">
                          {cs.subject.name}
                          {cs.subject.code && <span className="ml-1 font-mono">· {cs.subject.code}</span>}
                        </Badge>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            </Card>

            <Card padding="none">
              <CardHeader
                title="Teacher assignments"
                description="Who teaches what, per section, for a given academic year."
                actions={
                  years.length > 0 && (
                    <Select value={yearId} onChange={(e) => setYearId(e.target.value)} className="w-auto">
                      {years.map((y) => (
                        <option key={y.id} value={y.id}>
                          {y.name}
                        </option>
                      ))}
                    </Select>
                  )
                }
              />
              <div className="space-y-4 p-5">
                {sections.map((s) => {
                  const rows = assignmentsBySection[s.id];
                  return (
                    <div key={s.id}>
                      <p className="text-xs font-semibold uppercase tracking-wide text-foreground-muted">
                        Section {s.name}
                      </p>
                      {!rows ? (
                        <p className="mt-1 text-sm text-foreground-muted">Loading…</p>
                      ) : rows.length === 0 ? (
                        <p className="mt-1 text-sm text-foreground-muted">No teacher assigned yet for this year.</p>
                      ) : (
                        <div className="mt-1.5 flex flex-wrap gap-2">
                          {rows.map((r) => (
                            <Badge key={r.id}>
                              {r.subject.name} → {r.teacher.firstName} {r.teacher.lastName}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}
