"use client";

import { use, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useAuth, ApiError } from "@/lib/auth-context";
import {
  api,
  type AcademicYear,
  type ClassSubjectRecord,
  type ClassWithSections,
  type Section,
  type SectionTeacherAssignment,
  type Subject,
} from "@/lib/api";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input, Select } from "@/components/ui/FormControls";
import { SkeletonCards } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";
import { GraduationCap, Plus } from "lucide-react";

export default function ClassDetailPage({ params }: { params: Promise<{ id: string; classId: string }> }) {
  const { id: schoolId, classId } = use(params);
  const { user, accessToken } = useAuth();
  const { show } = useToast();

  const [cls, setCls] = useState<ClassWithSections | null>(null);
  const [sections, setSections] = useState<Section[] | null>(null);
  const [subjects, setSubjects] = useState<ClassSubjectRecord[] | null>(null);
  const [allSubjects, setAllSubjects] = useState<Subject[]>([]);
  const [years, setYears] = useState<AcademicYear[]>([]);
  const [yearId, setYearId] = useState("");
  const [assignmentsBySection, setAssignmentsBySection] = useState<Record<string, SectionTeacherAssignment[]>>({});
  const [error, setError] = useState<string | null>(null);

  const [sectionName, setSectionName] = useState("");
  const [sectionFormError, setSectionFormError] = useState<string | null>(null);
  const [pickSubjectId, setPickSubjectId] = useState("");
  const [assigning, setAssigning] = useState(false);

  useEffect(() => {
    if (!accessToken) return;
    Promise.all([
      api.listClasses(accessToken, schoolId),
      api.listSections(accessToken, schoolId, classId),
      api.listClassSubjects(accessToken, schoolId, classId),
      api.listAcademicYears(accessToken, schoolId),
      api.listSubjects(accessToken, schoolId),
    ])
      .then(([classes, secs, subs, y, allSubj]) => {
        const found = classes.find((c) => c.id === classId);
        if (!found) {
          setError("Class not found");
          return;
        }
        setCls(found);
        setSections(secs);
        setSubjects(subs);
        setYears(y);
        setAllSubjects(allSubj);
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

  async function onAddSection(e: FormEvent) {
    e.preventDefault();
    if (!accessToken || !sectionName.trim()) return;
    setSectionFormError(null);
    try {
      const section = await api.createSection(accessToken, schoolId, classId, { name: sectionName.trim() });
      setSections((prev) => (prev ? [...prev, section] : [section]));
      setSectionName("");
      show(`Section ${section.name} added.`);
    } catch (err) {
      setSectionFormError(err instanceof ApiError ? err.message : "Failed to add section");
    }
  }

  async function onAssignSubject() {
    if (!accessToken || !pickSubjectId) return;
    setAssigning(true);
    try {
      const record = await api.assignSubjectToClass(accessToken, schoolId, classId, pickSubjectId);
      setSubjects((prev) => (prev ? [...prev, record] : [record]));
      setPickSubjectId("");
      show("Subject assigned to class.");
    } catch (err) {
      show(err instanceof ApiError ? err.message : "Failed to assign subject", "danger");
    } finally {
      setAssigning(false);
    }
  }

  async function onUnassignSubject(subjectId: string) {
    if (!accessToken) return;
    try {
      await api.unassignSubjectFromClass(accessToken, schoolId, classId, subjectId);
      setSubjects((prev) => prev?.filter((cs) => cs.subjectId !== subjectId) ?? prev);
    } catch (err) {
      show(err instanceof ApiError ? err.message : "Failed to remove subject", "danger");
    }
  }

  const schoolName = user?.schools.find((s) => s.id === schoolId)?.name ?? "School";
  const canManage = user?.permissions.includes("academic.manage") ?? false;
  const unassignedSubjects = allSubjects.filter((s) => !subjects?.some((cs) => cs.subjectId === s.id));

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
                  <EmptyState icon={GraduationCap} title="No sections yet" description="Add a section below." />
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
                          <td className="px-5 py-3 text-foreground-soft">{s.capacity === null ? "Unlimited" : s.capacity}</td>
                          <td className="px-5 py-3 text-foreground-soft">{s._count.enrollments}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {canManage && (
                <form onSubmit={onAddSection} className="flex flex-wrap items-end gap-2 border-t border-border p-5">
                  <Input
                    value={sectionName}
                    onChange={(e) => setSectionName(e.target.value)}
                    placeholder="Section name, e.g. F"
                    className="max-w-[180px]"
                  />
                  <Button type="submit" size="sm" variant="outline" icon={<Plus className="size-4" />}>
                    Add section
                  </Button>
                  {sectionFormError && <p className="w-full text-sm text-danger">{sectionFormError}</p>}
                </form>
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
                      <span
                        key={cs.subjectId}
                        className="inline-flex items-center gap-1 rounded-full bg-accent-soft px-2.5 py-0.5 text-xs font-medium text-accent"
                      >
                        <Link href={`/schools/${schoolId}/academic/subjects/${cs.subjectId}`} className="hover:underline">
                          {cs.subject.name}
                          {cs.subject.code && <span className="ml-1 font-mono">· {cs.subject.code}</span>}
                        </Link>
                        {canManage && (
                          <button
                            type="button"
                            onClick={() => onUnassignSubject(cs.subjectId)}
                            className="text-accent/70 hover:text-danger"
                            aria-label={`Remove ${cs.subject.name}`}
                          >
                            ×
                          </button>
                        )}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              {canManage && unassignedSubjects.length > 0 && (
                <div className="flex flex-wrap items-center gap-2 border-t border-border p-5">
                  <Select value={pickSubjectId} onChange={(e) => setPickSubjectId(e.target.value)} className="w-auto">
                    <option value="">Select a subject…</option>
                    {unassignedSubjects.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </Select>
                  <Button type="button" size="sm" variant="outline" loading={assigning} disabled={!pickSubjectId} onClick={onAssignSubject}>
                    Assign
                  </Button>
                </div>
              )}
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
