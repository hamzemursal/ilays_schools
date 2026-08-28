"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useAuth, ApiError } from "@/lib/auth-context";
import { api, type School, type SchoolType } from "@/lib/api";

const SCHOOL_TYPES: { value: SchoolType; label: string }[] = [
  { value: "PRIMARY", label: "Primary" },
  { value: "SECONDARY", label: "Secondary" },
  { value: "PRIMARY_AND_SECONDARY", label: "Primary & Secondary" },
];

export default function SchoolsPage() {
  const router = useRouter();
  const { user, accessToken, loading } = useAuth();
  const [schools, setSchools] = useState<School[] | null>(null);
  const [listError, setListError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [type, setType] = useState<SchoolType>("PRIMARY");
  const [address, setAddress] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!loading && !user) router.push("/login");
  }, [loading, user, router]);

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
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Failed to create school");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading || !user) return <p className="p-8 text-foreground-soft">Loading…</p>;

  const canCreate = user.permissions.includes("schools.create");
  const canView = user.permissions.includes("schools.view");

  if (!canView) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-16">
        <p className="rounded-lg bg-danger-soft px-4 py-3 text-danger">
          You don&apos;t have permission to view schools.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-16">
      <span className="text-sm font-semibold uppercase tracking-wide text-accent">Organization</span>
      <h1 className="mt-1 text-2xl font-semibold text-foreground">Schools</h1>

      {canCreate && (
        <form onSubmit={onCreate} className="mt-6 rounded-xl border border-border bg-surface p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-foreground-soft">Create school</h2>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-foreground-soft" htmlFor="name">
                Name
              </label>
              <input
                id="name"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-foreground outline-none focus:border-accent"
                placeholder="Sayid Secondary School"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground-soft" htmlFor="type">
                Type
              </label>
              <select
                id="type"
                value={type}
                onChange={(e) => setType(e.target.value as SchoolType)}
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-foreground outline-none focus:border-accent"
              >
                {SCHOOL_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-foreground-soft" htmlFor="address">
                Address (optional)
              </label>
              <input
                id="address"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-foreground outline-none focus:border-accent"
              />
            </div>
          </div>

          {formError && (
            <p className="mt-3 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{formError}</p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="mt-4 rounded-lg bg-accent px-4 py-2 font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            {submitting ? "Creating…" : "Create school"}
          </button>
        </form>
      )}

      <div className="mt-6">
        {listError && <p className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{listError}</p>}
        {!schools && !listError && <p className="text-foreground-soft">Loading schools…</p>}
        {schools?.length === 0 && <p className="text-foreground-soft">No schools yet.</p>}

        <ul className="space-y-2">
          {schools?.map((school) => (
            <li key={school.id}>
              <Link
                href={`/schools/${school.id}`}
                className="flex items-center justify-between rounded-xl border border-border bg-surface p-4 hover:border-accent"
              >
                <div>
                  <p className="font-medium text-foreground">{school.name}</p>
                  <p className="text-sm text-foreground-soft">{school.type.replace(/_/g, " ")}</p>
                </div>
                <span className="rounded-full bg-success-soft px-3 py-1 text-xs font-medium text-success">
                  {school.status}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
