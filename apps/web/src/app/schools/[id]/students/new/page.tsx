"use client";

import { use, useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useAuth, ApiError } from "@/lib/auth-context";
import {
  api,
  type AcademicYear,
  type ClassWithSections,
  type DuplicateCandidate,
  type GuardianRelationship,
  type Sex,
} from "@/lib/api";

export default function NewStudentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: schoolId } = use(params);
  const router = useRouter();
  const { user, accessToken, loading } = useAuth();

  const [classes, setClasses] = useState<ClassWithSections[]>([]);
  const [years, setYears] = useState<AcademicYear[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [sex, setSex] = useState<Sex>("MALE");
  const [classId, setClassId] = useState("");
  const [sectionId, setSectionId] = useState("");
  const [academicYearId, setAcademicYearId] = useState("");

  const [guardianName, setGuardianName] = useState("");
  const [guardianPhone, setGuardianPhone] = useState("");
  const [guardianRelationship, setGuardianRelationship] = useState<GuardianRelationship>("FATHER");

  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [duplicates, setDuplicates] = useState<DuplicateCandidate[] | null>(null);

  useEffect(() => {
    if (!loading && !user) router.push("/login");
  }, [loading, user, router]);

  useEffect(() => {
    if (!accessToken) return;
    Promise.all([api.listClasses(accessToken, schoolId), api.listAcademicYears(accessToken, schoolId)])
      .then(([c, y]) => {
        setClasses(c);
        setYears(y);
        if (c[0]) setClassId(c[0].id);
        if (c[0]?.sections[0]) setSectionId(c[0].sections[0].id);
        const current = y.find((yr) => yr.isCurrent) ?? y[0];
        if (current) setAcademicYearId(current.id);
      })
      .catch((err) => setLoadError(err instanceof ApiError ? err.message : "Failed to load form data"));
  }, [accessToken, schoolId]);

  const selectedClass = classes.find((c) => c.id === classId);

  async function submit(confirmDespiteDuplicates: boolean) {
    if (!accessToken) return;
    setFormError(null);
    setSubmitting(true);
    try {
      const [gFirst, ...gRest] = guardianName.trim().split(" ");
      const guardians =
        guardianName.trim().length > 0
          ? [
              {
                firstName: gFirst,
                lastName: gRest.join(" ") || gFirst,
                phone: guardianPhone || undefined,
                relationship: guardianRelationship,
                isPrimaryContact: true,
              },
            ]
          : undefined;

      await api.createStudent(accessToken, schoolId, {
        firstName,
        lastName,
        dateOfBirth,
        sex,
        enrollment: { academicYearId, classId, sectionId },
        guardians,
        confirmDespiteDuplicates,
      });
      router.push(`/schools/${schoolId}/students`);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409 && (err.body as { possibleDuplicates?: DuplicateCandidate[] })?.possibleDuplicates) {
        setDuplicates((err.body as { possibleDuplicates: DuplicateCandidate[] }).possibleDuplicates);
      } else {
        setFormError(err instanceof ApiError ? err.message : "Failed to create student");
      }
    } finally {
      setSubmitting(false);
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    submit(false);
  }

  if (loading || !user) return <p className="p-8 text-foreground-soft">Loading…</p>;
  if (loadError) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-16">
        <p className="rounded-lg bg-danger-soft px-4 py-3 text-danger">{loadError}</p>
      </div>
    );
  }

  if (duplicates) {
    return (
      <div className="mx-auto w-full max-w-xl px-6 py-16">
        <span className="text-sm font-semibold uppercase tracking-wide text-warning">Possible duplicate</span>
        <h1 className="mt-1 text-2xl font-semibold text-foreground">
          {duplicates.length} similar student{duplicates.length > 1 ? "s" : ""} already exist
        </h1>
        <p className="mt-2 text-foreground-soft">
          Same last name and date of birth as someone already in the system. Review before continuing —
          this is never merged automatically.
        </p>

        <ul className="mt-4 space-y-2">
          {duplicates.map((d) => (
            <li key={d.id} className="rounded-xl border border-border bg-surface p-4">
              <p className="font-medium text-foreground">
                {d.firstName} {d.lastName}
              </p>
              <p className="text-sm text-foreground-soft">
                Born {new Date(d.dateOfBirth).toLocaleDateString()}
              </p>
            </li>
          ))}
        </ul>

        <div className="mt-6 flex gap-3">
          <button
            onClick={() => setDuplicates(null)}
            className="rounded-lg border border-border px-4 py-2 text-sm text-foreground hover:border-accent"
          >
            Go back and check
          </button>
          <button
            onClick={() => submit(true)}
            disabled={submitting}
            className="rounded-lg bg-warning px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60"
          >
            {submitting ? "Creating…" : "This is a different person — create anyway"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-xl px-6 py-16">
      <span className="text-sm font-semibold uppercase tracking-wide text-accent">Students</span>
      <h1 className="mt-1 text-2xl font-semibold text-foreground">Add student</h1>

      <form onSubmit={onSubmit} className="mt-6 space-y-4 rounded-xl border border-border bg-surface p-5">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-foreground-soft">First name</label>
            <input
              required
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-foreground outline-none focus:border-accent"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground-soft">Last name</label>
            <input
              required
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-foreground outline-none focus:border-accent"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-foreground-soft">Date of birth</label>
            <input
              required
              type="date"
              value={dateOfBirth}
              onChange={(e) => setDateOfBirth(e.target.value)}
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-foreground outline-none focus:border-accent"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground-soft">Sex</label>
            <select
              value={sex}
              onChange={(e) => setSex(e.target.value as Sex)}
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-foreground outline-none focus:border-accent"
            >
              <option value="MALE">Male</option>
              <option value="FEMALE">Female</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="block text-sm font-medium text-foreground-soft">Academic year</label>
            <select
              required
              value={academicYearId}
              onChange={(e) => setAcademicYearId(e.target.value)}
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-foreground outline-none focus:border-accent"
            >
              {years.map((y) => (
                <option key={y.id} value={y.id}>
                  {y.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground-soft">Class</label>
            <select
              required
              value={classId}
              onChange={(e) => {
                setClassId(e.target.value);
                const c = classes.find((cl) => cl.id === e.target.value);
                setSectionId(c?.sections[0]?.id ?? "");
              }}
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-foreground outline-none focus:border-accent"
            >
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground-soft">Section</label>
            <select
              required
              value={sectionId}
              onChange={(e) => setSectionId(e.target.value)}
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-foreground outline-none focus:border-accent"
            >
              {selectedClass?.sections.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} (cap. {s.capacity})
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="border-t border-border pt-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-foreground-soft">
            Guardian (optional)
          </h2>
          <div className="mt-2 grid grid-cols-3 gap-3">
            <input
              value={guardianName}
              onChange={(e) => setGuardianName(e.target.value)}
              placeholder="Full name"
              className="rounded-lg border border-border bg-background px-3 py-2 text-foreground outline-none focus:border-accent"
            />
            <input
              value={guardianPhone}
              onChange={(e) => setGuardianPhone(e.target.value)}
              placeholder="Phone"
              className="rounded-lg border border-border bg-background px-3 py-2 text-foreground outline-none focus:border-accent"
            />
            <select
              value={guardianRelationship}
              onChange={(e) => setGuardianRelationship(e.target.value as GuardianRelationship)}
              className="rounded-lg border border-border bg-background px-3 py-2 text-foreground outline-none focus:border-accent"
            >
              <option value="FATHER">Father</option>
              <option value="MOTHER">Mother</option>
              <option value="GUARDIAN">Guardian</option>
              <option value="OTHER">Other</option>
            </select>
          </div>
          <p className="mt-1 text-xs text-foreground-soft">
            Matched by phone — if this parent already has another child in the system, they&apos;ll be linked
            to this one instead of duplicated.
          </p>
        </div>

        {formError && <p className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{formError}</p>}

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-lg bg-accent px-4 py-2 font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {submitting ? "Creating…" : "Create student"}
        </button>
      </form>
    </div>
  );
}
