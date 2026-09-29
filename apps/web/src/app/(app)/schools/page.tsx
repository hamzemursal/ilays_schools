"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useAuth, ApiError } from "@/lib/auth-context";
import { api, type School, type SchoolType, type SchoolDeletionImpact } from "@/lib/api";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { EmptyState } from "@/components/ui/EmptyState";
import { FormField, Input, Select } from "@/components/ui/FormControls";
import { SkeletonCards } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { ArrowRight, Briefcase, Building2, GraduationCap, MapPin, Plus, School as School2, Search, ShieldCheck, ShieldX, Trash2, Users } from "lucide-react";
import { SchoolTypeBadge } from "@/features/my-classes/components/SchoolTypeBadge";

const SCHOOL_TYPES: { value: SchoolType; label: string }[] = [
  { value: "PRIMARY", label: "Primary" },
  { value: "SECONDARY", label: "Secondary" },
  { value: "PRIMARY_AND_SECONDARY", label: "Primary & Secondary" },
];

// A combined PRIMARY_AND_SECONDARY school genuinely teaches both divisions
// (SchoolsService.create gives it both Division rows), so it belongs in
// both tabs rather than being arbitrarily assigned to just one — the point
// of the tabs is "never show primary and secondary mixed in one list," not
// "hide a school that offers both."
const TABS = ["Primary Schools", "Secondary Schools"] as const;
type Tab = (typeof TABS)[number];

type StatusFilter = "ALL" | "ACTIVE" | "INACTIVE";
type SortOption = "NAME_ASC" | "NAME_DESC" | "STUDENTS_DESC" | "STUDENTS_ASC";

export default function SchoolsPage() {
  const { user, accessToken } = useAuth();
  const [schools, setSchools] = useState<School[] | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  const [tab, setTab] = useState<Tab>("Primary Schools");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [sort, setSort] = useState<SortOption>("NAME_ASC");

  const [name, setName] = useState("");
  const [type, setType] = useState<SchoolType>("PRIMARY");
  const [address, setAddress] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<School | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [loadingImpactFor, setLoadingImpactFor] = useState<string | null>(null);
  const [deletionImpact, setDeletionImpact] = useState<SchoolDeletionImpact | null>(null);
  const { show } = useToast();

  useEffect(() => {
    if (!accessToken) return;
    api
      .listSchools(accessToken)
      .then(setSchools)
      .catch((err) => setListError(err instanceof ApiError ? err.message : "Failed to load schools"));
  }, [accessToken]);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    if (!accessToken) return;
    setFormError(null);
    setSubmitting(true);
    try {
      const school = await api.createSchool(accessToken, { name, type, address: address || undefined });
      setSchools((prev) => (prev ? [school, ...prev] : [school]));
      setName("");
      setAddress("");
      setShowForm(false);
      show(`${school.name} created.`);
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Failed to create school");
    } finally {
      setSubmitting(false);
    }
  }

  const canCreate = user?.permissions.includes("schools.create") ?? false;
  const canView = user?.permissions.includes("schools.view") ?? false;
  const canManage = user?.permissions.includes("schools.manage") ?? false;

  async function onClickDelete(school: School) {
    if (!accessToken) return;
    setLoadingImpactFor(school.id);
    setDeletionImpact(null);
    try {
      const impact = await api.getSchoolDeletionImpact(accessToken, school.id);
      setDeletionImpact(impact);
      setDeleteTarget(school);
    } catch (err) {
      show(err instanceof ApiError ? err.message : "Failed to load deletion impact", "danger");
    } finally {
      setLoadingImpactFor(null);
    }
  }

  async function onConfirmDelete() {
    if (!accessToken || !deleteTarget) return;
    setDeleting(true);
    try {
      await api.removeSchool(accessToken, deleteTarget.id);
      setSchools((prev) => (prev ? prev.filter((s) => s.id !== deleteTarget.id) : prev));
      show(`${deleteTarget.name} deleted.`);
      setDeleteTarget(null);
      setDeletionImpact(null);
    } catch (err) {
      show(err instanceof ApiError ? err.message : "Failed to delete school", "danger");
    } finally {
      setDeleting(false);
    }
  }

  const filtered = useMemo(() => {
    if (!schools) return null;
    const wantsPrimary = tab === "Primary Schools";
    let list = schools.filter((s) =>
      wantsPrimary
        ? s.type === "PRIMARY" || s.type === "PRIMARY_AND_SECONDARY"
        : s.type === "SECONDARY" || s.type === "PRIMARY_AND_SECONDARY",
    );
    if (statusFilter !== "ALL") list = list.filter((s) => s.status === statusFilter);
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      list = list.filter((s) => s.name.toLowerCase().includes(q) || (s.address ?? "").toLowerCase().includes(q));
    }
    const sorted = [...list];
    sorted.sort((a, b) => {
      if (sort === "NAME_ASC") return a.name.localeCompare(b.name);
      if (sort === "NAME_DESC") return b.name.localeCompare(a.name);
      if (sort === "STUDENTS_DESC") return b.studentCount - a.studentCount;
      return a.studentCount - b.studentCount;
    });
    return sorted;
  }, [schools, tab, statusFilter, query, sort]);

  if (user && !canView) {
    return (
      <div className="p-4 sm:p-6">
        <Alert tone="danger">You don&apos;t have permission to view schools.</Alert>
      </div>
    );
  }

  const inTab = (s: School, t: Tab) =>
    t === "Primary Schools"
      ? s.type === "PRIMARY" || s.type === "PRIMARY_AND_SECONDARY"
      : s.type === "SECONDARY" || s.type === "PRIMARY_AND_SECONDARY";
  const tabStats = (t: Tab) => {
    const list = (schools ?? []).filter((s) => inTab(s, t));
    return { total: list.length, active: list.filter((s) => s.status === "ACTIVE").length };
  };

  return (
    <div>
      <PageHeader
        variant="plain"
        eyebrow="Organization"
        title="Schools"
        description="Every school in your organization, by division."
        breadcrumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "Schools" }]}
        actions={
          canCreate && (
            <Button
              icon={<Plus className="size-4" />}
              variant={showForm ? "outline" : "primary"}
              onClick={() => setShowForm((v) => !v)}
            >
              {showForm ? "Cancel" : "New school"}
            </Button>
          )
        }
      />

      <div className="space-y-5 px-3 pb-8 pt-4 sm:px-5">
        {/* Division switcher: one card per division, with its real counts. */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2" role="tablist" aria-label="Division">
          {TABS.map((t) => {
            const active = tab === t;
            const meta = TAB_META[t];
            const stats = tabStats(t);
            return (
              <button
                key={t}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setTab(t)}
                className={`flex items-center gap-4 rounded-2xl border bg-background p-4 text-left shadow-sm transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 sm:p-5 ${
                  active ? `${meta.activeBorder} ring-1 ${meta.ring}` : "border-border hover:-translate-y-0.5 hover:shadow-md"
                }`}
              >
                <span className={`flex size-12 shrink-0 items-center justify-center rounded-2xl ${meta.soft} ${meta.text}`}>
                  <meta.icon className="size-6" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-base font-semibold text-foreground">{t}</span>
                  <span className="mt-0.5 block text-sm text-foreground-soft">
                    {schools ? `${stats.total} school${stats.total === 1 ? "" : "s"} · ${stats.active} active` : "Loading…"}
                  </span>
                </span>
                {active && <span className={`h-10 w-1.5 shrink-0 rounded-full ${meta.bar}`} aria-hidden />}
              </button>
            );
          })}
        </div>

        {showForm && (
          <Card className="rounded-2xl">
            <h2 className="text-base font-semibold text-foreground">Create school</h2>
            <form onSubmit={onCreate} className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField label="Name" htmlFor="new-school-name" required>
                <Input
                  id="new-school-name"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Sayid Secondary School"
                />
              </FormField>
              <FormField label="Type" required>
                <Select value={type} onChange={(e) => setType(e.target.value as SchoolType)}>
                  {SCHOOL_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </Select>
              </FormField>
              <FormField label="Address (optional)" className="sm:col-span-2">
                <Input value={address} onChange={(e) => setAddress(e.target.value)} />
              </FormField>

              {formError && (
                <Alert tone="danger" className="sm:col-span-2">
                  {formError}
                </Alert>
              )}

              <div className="sm:col-span-2">
                <Button type="submit" loading={submitting}>
                  Create school
                </Button>
              </div>
            </form>
          </Card>
        )}

        <div className="flex flex-col gap-3 rounded-2xl border border-border bg-background p-4 shadow-sm sm:flex-row sm:items-center">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-foreground-muted" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name or location…"
              aria-label="Search schools"
              className="pl-9"
            />
          </div>
          <div className="flex gap-3">
            <Select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
              aria-label="Status"
              className="w-full sm:w-44"
            >
              <option value="ALL">All statuses</option>
              <option value="ACTIVE">Active</option>
              <option value="INACTIVE">Inactive</option>
            </Select>
            <Select value={sort} onChange={(e) => setSort(e.target.value as SortOption)} aria-label="Sort" className="w-full sm:w-44">
              <option value="NAME_ASC">Name (A–Z)</option>
              <option value="NAME_DESC">Name (Z–A)</option>
              <option value="STUDENTS_DESC">Most students</option>
              <option value="STUDENTS_ASC">Fewest students</option>
            </Select>
          </div>
        </div>

        {listError ? (
          <Alert tone="danger">{listError}</Alert>
        ) : !filtered ? (
          <SkeletonCards count={6} />
        ) : filtered.length === 0 ? (
          <Card className="rounded-2xl">
            <EmptyState
              icon={Building2}
              title={`No ${tab === "Primary Schools" ? "primary" : "secondary"} schools yet`}
              description="Create one to get started, or adjust your filters."
            />
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {filtered.map((school) => {
              const tone = TYPE_TONE[school.type];
              return (
                <div
                  key={school.id}
                  className="group flex flex-col overflow-hidden rounded-2xl border border-border bg-background shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
                >
                  <div className={`h-1.5 ${tone.bar}`} aria-hidden />
                  <div className="flex-1 p-5">
                    <div className="flex items-start gap-3">
                      <span className={`flex size-12 shrink-0 items-center justify-center rounded-2xl ${tone.soft} ${tone.text}`}>
                        <Building2 className="size-6" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-base font-semibold text-foreground">{school.name}</p>
                        <div className="mt-1 flex flex-wrap items-center gap-1.5">
                          <SchoolTypeBadge type={school.type} />
                          <Badge tone={school.status === "ACTIVE" ? "success" : "neutral"}>{school.status}</Badge>
                        </div>
                      </div>
                    </div>
                    <p className="mt-3 flex items-center gap-1.5 text-sm text-foreground-soft">
                      <MapPin className="size-3.5 shrink-0 text-foreground-muted" />
                      <span className="truncate">{school.address || "No address on file"}</span>
                    </p>

                    <div className="mt-4 grid grid-cols-3 gap-2">
                      <SchoolStat icon={Users} tone="bg-accent-soft text-accent" value={school.studentCount} label="Students" />
                      <SchoolStat icon={GraduationCap} tone="bg-violet-50 text-violet-600" value={school.teacherCount} label="Teachers" />
                      <SchoolStat icon={Briefcase} tone="bg-amber-50 text-amber-600" value={school.staffCount} label="Staff" />
                    </div>

                    <div className="mt-4">
                      {school.hasActiveAdmin ? (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-success-soft px-2.5 py-1 text-xs font-medium text-success">
                          <ShieldCheck className="size-3.5" /> Admin active
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-warning-soft px-2.5 py-1 text-xs font-medium text-warning">
                          <ShieldX className="size-3.5" /> No admin yet
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-2 border-t border-border bg-surface-soft/60 p-3">
                    <Link href={`/schools/${school.id}`} className="flex-1">
                      <Button size="sm" variant="secondary" className="w-full" icon={<ArrowRight className="size-4" />}>
                        View School
                      </Button>
                    </Link>
                    {canManage && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-danger hover:bg-danger-soft hover:text-danger"
                        icon={<Trash2 className="size-4" />}
                        loading={loadingImpactFor === school.id}
                        onClick={() => onClickDelete(school)}
                        aria-label={`Delete ${school.name}`}
                      />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <ConfirmDialog
        open={!!deleteTarget}
        title={`Delete ${deleteTarget?.name ?? "this school"}?`}
        description={deletionImpact && <DeletionImpactSummary impact={deletionImpact} />}
        confirmLabel="Delete school"
        loading={deleting}
        requireTypedConfirmation={deleteTarget?.name}
        onConfirm={onConfirmDelete}
        onCancel={() => {
          setDeleteTarget(null);
          setDeletionImpact(null);
        }}
      />
    </div>
  );
}

// Division colors: Primary blue, Secondary violet (same as SchoolTypeBadge),
// a school teaching both in teal.
const TAB_META = {
  "Primary Schools": {
    icon: GraduationCap,
    soft: "bg-accent-soft",
    text: "text-accent",
    bar: "bg-accent",
    activeBorder: "border-accent",
    ring: "ring-accent/30",
  },
  "Secondary Schools": {
    icon: School2,
    soft: "bg-violet-50",
    text: "text-violet-600",
    bar: "bg-violet-500",
    activeBorder: "border-violet-400",
    ring: "ring-violet-300",
  },
} as const;

const TYPE_TONE: Record<SchoolType, { bar: string; soft: string; text: string }> = {
  PRIMARY: { bar: "bg-accent", soft: "bg-accent-soft", text: "text-accent" },
  SECONDARY: { bar: "bg-violet-500", soft: "bg-violet-50", text: "text-violet-600" },
  PRIMARY_AND_SECONDARY: { bar: "bg-teal-500", soft: "bg-teal-50", text: "text-teal-600" },
};

function SchoolStat({
  icon: Icon,
  tone,
  value,
  label,
}: {
  icon: React.ComponentType<{ className?: string }>;
  tone: string;
  value: number;
  label: string;
}) {
  return (
    <div className="rounded-xl bg-surface-soft p-2.5">
      <span className={`flex size-7 items-center justify-center rounded-lg ${tone}`}>
        <Icon className="size-3.5" />
      </span>
      <p className="mt-1.5 text-lg font-bold leading-none tabular-nums text-foreground">{value}</p>
      <p className="mt-0.5 text-xs text-foreground-muted">{label}</p>
    </div>
  );
}

// Every number here is a real count from the impact-preview endpoint — a
// school is never blocked from deletion just for having history, so this is
// the one real warning standing between a click and permanently losing it
// all (students, teachers, classes, years of academic and financial records).
function DeletionImpactSummary({ impact }: { impact: SchoolDeletionImpact }) {
  const allRows: Array<[string, number]> = [
    ["Student enrollments", impact.counts.enrollments],
    ["Teachers", impact.counts.teachers],
    ["Academic years", impact.counts.academicYears],
    ["Classes", impact.counts.classes],
    ["Sections", impact.counts.sections],
    ["Subjects", impact.counts.subjects],
    ["Exams", impact.counts.exams],
    ["Exam subjects", impact.counts.examSubjects],
    ["Result records", impact.counts.results],
    ["Attendance records", impact.counts.attendanceRecords],
    ["Fee structures", impact.counts.feeStructures],
    ["Invoices", impact.counts.invoices],
    ["Payments", impact.counts.payments],
    ["Transfers", impact.counts.transfers],
    ["Promotion batches", impact.counts.promotionBatches],
    ["Promotion records", impact.counts.promotionItems],
    ["Announcements", impact.counts.announcements],
  ];
  const rows = allRows.filter(([, count]) => count > 0);

  return (
    <div>
      {rows.length === 0 ? (
        <p>This school has no related records yet — deleting it is safe.</p>
      ) : (
        <>
          <p className="font-medium text-foreground">
            This permanently deletes the school and everything below. This action cannot be undone.
          </p>
          <ul className="mt-1.5 max-h-48 list-inside list-disc space-y-0.5 overflow-y-auto">
            {rows.map(([label, count]) => (
              <li key={label}>
                {count.toLocaleString()} {label}
              </li>
            ))}
          </ul>
        </>
      )}
      {impact.school.hasActiveAdmin && (
        <p className="mt-2 font-medium text-danger">
          This school has an active School Admin — deleting it will remove their access to it.
        </p>
      )}
    </div>
  );
}
