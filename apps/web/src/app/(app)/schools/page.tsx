"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { useAuth, ApiError } from "@/lib/auth-context";
import { api, type School, type SchoolType } from "@/lib/api";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { EmptyState } from "@/components/ui/EmptyState";
import { FormField, Input, Select } from "@/components/ui/FormControls";
import { SkeletonTable } from "@/components/ui/Skeleton";
import { Building2, ChevronRight, Plus } from "lucide-react";

const SCHOOL_TYPES: { value: SchoolType; label: string }[] = [
  { value: "PRIMARY", label: "Primary" },
  { value: "SECONDARY", label: "Secondary" },
  { value: "PRIMARY_AND_SECONDARY", label: "Primary & Secondary" },
];

export default function SchoolsPage() {
  const { user, accessToken } = useAuth();
  const [schools, setSchools] = useState<School[] | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  const [name, setName] = useState("");
  const [type, setType] = useState<SchoolType>("PRIMARY");
  const [address, setAddress] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

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
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Failed to create school");
    } finally {
      setSubmitting(false);
    }
  }

  const canCreate = user?.permissions.includes("schools.create") ?? false;
  const canView = user?.permissions.includes("schools.view") ?? false;

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

              {formError && <Alert tone="danger" className="sm:col-span-2">{formError}</Alert>}

              <div className="sm:col-span-2">
                <Button type="submit" loading={submitting}>
                  Create school
                </Button>
              </div>
            </form>
          </Card>
        )}

        {listError ? (
          <Alert tone="danger">{listError}</Alert>
        ) : !schools ? (
          <SkeletonTable rows={4} cols={3} />
        ) : schools.length === 0 ? (
          <EmptyState icon={Building2} title="No schools yet" description="Create your organization's first school to get started." />
        ) : (
          <div className="space-y-2">
            {schools.map((school) => (
              <Link key={school.id} href={`/schools/${school.id}`}>
                <Card className="flex items-center justify-between transition-colors hover:border-accent">
                  <div>
                    <p className="font-medium text-foreground">{school.name}</p>
                    <p className="text-sm text-foreground-soft">{school.type.replace(/_/g, " ")}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge tone={school.status === "ACTIVE" ? "success" : "neutral"}>{school.status}</Badge>
                    <ChevronRight className="size-4 text-foreground-muted" />
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
