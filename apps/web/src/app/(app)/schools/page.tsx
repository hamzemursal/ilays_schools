"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useAuth, ApiError } from "@/lib/auth-context";
import { api, type School, type SchoolType } from "@/lib/api";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { EmptyState } from "@/components/ui/EmptyState";
import { FormField, Input, Select } from "@/components/ui/FormControls";
import { SkeletonCards } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";
import { Building2, GraduationCap, MapPin, Plus, Search, ShieldCheck, ShieldX, Users } from "lucide-react";

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

  return (
    <div>
      <PageHeader
        eyebrow="Organization"
        title="Schools"
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

      <div className="border-b border-border px-4 sm:px-6">
        <div className="flex gap-1 overflow-x-auto">
          {TABS.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`shrink-0 border-b-2 px-3 py-3 text-sm font-medium transition-colors ${
                tab === t ? "border-accent text-accent" : "border-transparent text-foreground-soft hover:text-foreground"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-5 p-4 sm:p-6">
        {showForm && (
          <Card>
            <h2 className="text-sm font-semibold text-foreground">Create school</h2>
            <form onSubmit={onCreate} className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField label="Name" required>
                <Input required value={name} onChange={(e) => setName(e.target.value)} placeholder="Sayid Secondary School" />
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

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-full max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-foreground-muted" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name or location…"
              className="pl-9"
            />
          </div>
          <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as StatusFilter)} className="w-auto">
            <option value="ALL">All statuses</option>
            <option value="ACTIVE">Active</option>
            <option value="INACTIVE">Inactive</option>
          </Select>
          <Select value={sort} onChange={(e) => setSort(e.target.value as SortOption)} className="w-auto">
            <option value="NAME_ASC">Name (A–Z)</option>
            <option value="NAME_DESC">Name (Z–A)</option>
            <option value="STUDENTS_DESC">Most students</option>
            <option value="STUDENTS_ASC">Fewest students</option>
          </Select>
        </div>

        {listError ? (
          <Alert tone="danger">{listError}</Alert>
        ) : !filtered ? (
          <SkeletonCards count={6} />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={Building2}
            title={`No ${tab === "Primary Schools" ? "primary" : "secondary"} schools yet`}
            description="Create one to get started, or adjust your filters."
          />
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((school) => (
              <Card key={school.id} padding="none" className="flex flex-col">
                <div className="flex-1 p-5">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-semibold text-foreground">{school.name}</p>
                    <Badge tone={school.status === "ACTIVE" ? "success" : "neutral"}>{school.status}</Badge>
                  </div>
                  <p className="mt-1 text-xs font-medium uppercase tracking-wide text-foreground-muted">
                    {school.type.replace(/_/g, " ")}
                  </p>
                  {school.address && (
                    <p className="mt-2 flex items-center gap-1.5 text-sm text-foreground-soft">
                      <MapPin className="size-3.5 shrink-0" /> {school.address}
                    </p>
                  )}
                  <div className="mt-3 grid grid-cols-2 gap-3">
                    <div>
                      <p className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                        <Users className="size-3.5 text-foreground-muted" /> {school.studentCount}
                      </p>
                      <p className="text-xs text-foreground-muted">Students</p>
                    </div>
                    <div>
                      <p className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                        <GraduationCap className="size-3.5 text-foreground-muted" /> {school.teacherCount}
                      </p>
                      <p className="text-xs text-foreground-muted">Teachers</p>
                    </div>
                  </div>
                  <div className="mt-3">
                    {school.hasActiveAdmin ? (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-success">
                        <ShieldCheck className="size-3.5" /> Admin active
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-warning">
                        <ShieldX className="size-3.5" /> No admin yet
                      </span>
                    )}
                  </div>
                </div>
                <div className="border-t border-border p-3">
                  <Link href={`/schools/${school.id}`}>
                    <Button size="sm" variant="outline" className="w-full">
                      View School
                    </Button>
                  </Link>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
