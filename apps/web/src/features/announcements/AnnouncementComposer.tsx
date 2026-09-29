"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { ApiError } from "@/lib/auth-context";
import {
  api,
  type AcademicYear,
  type AnnouncementAudience,
  type AnnouncementRecipientOption,
  type AnnouncementTargetInput,
} from "@/lib/api";
import { useYearClasses } from "@/lib/useYearClasses";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { FormField, Input, Select, Textarea } from "@/components/ui/FormControls";
import { Search, Users, X } from "lucide-react";

export const AUDIENCE_OPTIONS: { value: AnnouncementAudience; label: string; hint: string }[] = [
  { value: "ALL", label: "Everyone (current)", hint: "Current students, parents of current students, teachers and staff." },
  { value: "CURRENT_STUDENTS", label: "Current Students", hint: "Students with an active enrollment — never alumni." },
  { value: "PARENTS", label: "Parents of Current Students", hint: "Parents with at least one child currently enrolled." },
  { value: "TEACHERS", label: "Teachers", hint: "Teachers of this school." },
  { value: "STAFF", label: "Staff", hint: "Staff and school administrators." },
  { value: "ALUMNI", label: "Alumni", hint: "Graduates of this school." },
  { value: "FORMER_PARENTS", label: "Former Parents", hint: "Parents whose children here have all finished school." },
  { value: "INDIVIDUAL", label: "Specific People", hint: "Only the people you choose below." },
];

export const AUDIENCE_LABEL = Object.fromEntries(AUDIENCE_OPTIONS.map((o) => [o.value, o.label])) as Record<
  AnnouncementAudience,
  string
>;

// Current audiences can be narrowed; the rest are always school-wide.
const SCOPED: AnnouncementAudience[] = ["ALL", "CURRENT_STUDENTS", "PARENTS", "TEACHERS"];
type Scope = "SCHOOL" | "CLASS" | "SECTION";

export function AnnouncementComposer({
  accessToken,
  schoolId,
  onPosted,
  onCancel,
}: {
  accessToken: string;
  schoolId: string;
  onPosted: () => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [audience, setAudience] = useState<AnnouncementAudience>("ALL");
  const [scope, setScope] = useState<Scope>("SCHOOL");
  const [years, setYears] = useState<AcademicYear[]>([]);
  const [yearId, setYearId] = useState("");
  const [classId, setClassId] = useState("");
  const [sectionId, setSectionId] = useState("");
  const [people, setPeople] = useState<AnnouncementRecipientOption[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .listAcademicYears(accessToken, schoolId)
      .then((list) => {
        setYears(list);
        setYearId((list.find((y) => y.isCurrent) ?? list[0])?.id ?? "");
      })
      .catch(() => setYears([]));
  }, [accessToken, schoolId]);

  const classes = useYearClasses(accessToken, schoolId, yearId);
  const sections = classes.find((c) => c.id === classId)?.sections ?? [];
  const scoped = SCOPED.includes(audience);
  const effectiveScope: Scope = scoped ? scope : "SCHOOL";

  // The exact target the server will receive, or null while incomplete.
  const target: AnnouncementTargetInput | null = useMemo(() => {
    if (audience === "INDIVIDUAL") return people.length ? { audience, recipientUserIds: people.map((p) => p.userId) } : null;
    if (effectiveScope === "SCHOOL") return { audience };
    if (!yearId || !classId) return null;
    if (effectiveScope === "CLASS") return { audience, academicYearId: yearId, classId };
    return sectionId ? { audience, academicYearId: yearId, classId, sectionId } : null;
  }, [audience, effectiveScope, yearId, classId, sectionId, people]);

  const targetKey = target ? JSON.stringify(target) : "";
  const [preview, setPreview] = useState<{ key: string; count: number | null; error?: string } | null>(null);
  useEffect(() => {
    if (!targetKey) return;
    let cancelled = false;
    const t = setTimeout(() => {
      api
        .previewAnnouncement(accessToken, schoolId, JSON.parse(targetKey))
        .then((r) => !cancelled && setPreview({ key: targetKey, count: r.recipients }))
        .catch((err) => !cancelled && setPreview({ key: targetKey, count: null, error: err instanceof ApiError ? err.message : undefined }));
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [accessToken, schoolId, targetKey]);
  const current = preview?.key === targetKey ? preview : null;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!target) return;
    setSaving(true);
    setError(null);
    try {
      await api.createAnnouncement(accessToken, schoolId, { title, body, ...target });
      onPosted();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to post announcement");
    } finally {
      setSaving(false);
    }
  }

  const hint = AUDIENCE_OPTIONS.find((o) => o.value === audience)?.hint;

  return (
    <form onSubmit={onSubmit} className="space-y-4 p-5">
      <FormField label="Title" htmlFor="announcement-title" required>
        <Input id="announcement-title" required value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Mid-term break" />
      </FormField>
      <FormField label="Message" htmlFor="announcement-body" required>
        <Textarea id="announcement-body" required rows={4} value={body} onChange={(e) => setBody(e.target.value)} />
      </FormField>

      <div className="grid gap-4 rounded-xl border border-border bg-surface-soft/60 p-4 md:grid-cols-2">
        <FormField label="Audience" htmlFor="audience" hint={hint}>
          <Select id="audience" value={audience} onChange={(e) => setAudience(e.target.value as AnnouncementAudience)}>
            {AUDIENCE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        </FormField>

        {scoped && (
          <FormField label="Scope" htmlFor="scope">
            <Select id="scope" value={scope} onChange={(e) => setScope(e.target.value as Scope)}>
              <option value="SCHOOL">Whole School</option>
              <option value="CLASS">Class</option>
              <option value="SECTION">Section</option>
            </Select>
          </FormField>
        )}

        {scoped && effectiveScope !== "SCHOOL" && (
          <>
            <FormField label="Academic Year" htmlFor="year">
              <Select
                id="year"
                value={yearId}
                onChange={(e) => {
                  setYearId(e.target.value);
                  setClassId("");
                  setSectionId("");
                }}
              >
                {years.map((y) => (
                  <option key={y.id} value={y.id}>
                    {y.name}
                    {y.isCurrent ? " (current)" : ""}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField label="Class" htmlFor="class">
              <Select
                id="class"
                value={classId}
                onChange={(e) => {
                  setClassId(e.target.value);
                  setSectionId("");
                }}
              >
                <option value="">Choose a class…</option>
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </FormField>
            {effectiveScope === "SECTION" && (
              <FormField label="Section" htmlFor="section">
                <Select id="section" value={sectionId} onChange={(e) => setSectionId(e.target.value)} disabled={!classId}>
                  <option value="">Choose a section…</option>
                  {sections.map((s) => (
                    <option key={s.id} value={s.id}>
                      Section {s.name}
                    </option>
                  ))}
                </Select>
              </FormField>
            )}
          </>
        )}

        {audience === "INDIVIDUAL" && (
          <div className="md:col-span-2">
            <PeoplePicker accessToken={accessToken} schoolId={schoolId} chosen={people} onChange={setPeople} />
          </div>
        )}

        <p className="flex items-center gap-2 text-sm text-foreground-soft md:col-span-2" aria-live="polite">
          <Users className="size-4 text-accent" />
          {!target
            ? audience === "INDIVIDUAL"
              ? "Choose at least one person."
              : "Finish choosing the scope."
            : !current
              ? "Counting recipients…"
              : current.count === null
                ? current.error ?? "Could not count recipients."
                : `Will reach approximately ${current.count} ${current.count === 1 ? "person" : "people"}.`}
        </p>
      </div>

      {error && <Alert tone="danger">{error}</Alert>}
      <div className="flex gap-2">
        <Button type="submit" size="sm" loading={saving} disabled={!target || current?.count === null}>
          Post announcement
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

function PeoplePicker({
  accessToken,
  schoolId,
  chosen,
  onChange,
}: {
  accessToken: string;
  schoolId: string;
  chosen: AnnouncementRecipientOption[];
  onChange: (people: AnnouncementRecipientOption[]) => void;
}) {
  const [query, setQuery] = useState("");
  const [found, setFound] = useState<{ q: string; options: AnnouncementRecipientOption[] } | null>(null);
  const q = query.trim();

  useEffect(() => {
    if (q.length < 2) return;
    let cancelled = false;
    const t = setTimeout(() => {
      api
        .searchAnnouncementRecipients(accessToken, schoolId, q)
        .then((options) => !cancelled && setFound({ q, options }))
        .catch(() => !cancelled && setFound({ q, options: [] }));
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [accessToken, schoolId, q]);

  const results = q.length >= 2 && found?.q === q ? found.options.filter((o) => !chosen.some((c) => c.userId === o.userId)) : [];

  return (
    <div className="space-y-2">
      <FormField label="People" htmlFor="people-search" hint="Search students, alumni, parents, teachers or staff of this school.">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-foreground-muted" />
          <Input
            id="people-search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Type at least 2 letters…"
            className="pl-9"
            autoComplete="off"
          />
        </div>
      </FormField>
      {results.length > 0 && (
        <ul className="max-h-56 divide-y divide-border overflow-y-auto rounded-xl border border-border bg-background" role="listbox" aria-label="Matching people">
          {results.map((o) => (
            <li key={o.userId}>
              <button
                type="button"
                role="option"
                aria-selected={false}
                onClick={() => {
                  onChange([...chosen, o]);
                  setQuery("");
                }}
                className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-surface-hover focus-visible:bg-surface-hover focus-visible:outline-none"
              >
                <span className="font-medium text-foreground">{o.name}</span>
                <span className="text-xs text-foreground-muted">{o.kind}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {chosen.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {chosen.map((p) => (
            <span key={p.userId} className="inline-flex items-center gap-1 rounded-full bg-accent-soft py-1 pl-3 pr-1 text-xs font-medium text-accent">
              {p.name} · {p.kind}
              <button
                type="button"
                onClick={() => onChange(chosen.filter((c) => c.userId !== p.userId))}
                aria-label={`Remove ${p.name}`}
                className="rounded-full p-0.5 hover:bg-accent/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                <X className="size-3.5" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
