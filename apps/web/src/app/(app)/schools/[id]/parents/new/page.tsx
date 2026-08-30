"use client";

import { use, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useAuth, ApiError } from "@/lib/auth-context";
import { parentsApi } from "@/features/parents/api";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { FormField, Input } from "@/components/ui/FormControls";
import { useToast } from "@/components/ui/Toast";

interface DuplicateGuardian {
  id: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  email: string | null;
}

export default function AddParentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: schoolId } = use(params);
  const { accessToken } = useAuth();
  const router = useRouter();
  const { show } = useToast();

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [duplicates, setDuplicates] = useState<DuplicateGuardian[] | null>(null);

  async function submit(confirmDespiteDuplicates: boolean) {
    if (!accessToken) return;
    setSubmitting(true);
    setError(null);
    try {
      const parent = await parentsApi.create(accessToken, schoolId, {
        firstName,
        lastName,
        phone: phone || undefined,
        email: email || undefined,
        address: address || undefined,
        confirmDespiteDuplicates,
      });
      show(`${parent.firstName} ${parent.lastName} added.`);
      router.push(`/schools/${schoolId}/parents/${parent.id}`);
    } catch (err) {
      if (
        err instanceof ApiError &&
        err.status === 409 &&
        (err.body as { possibleDuplicates?: DuplicateGuardian[] })?.possibleDuplicates
      ) {
        setDuplicates((err.body as { possibleDuplicates: DuplicateGuardian[] }).possibleDuplicates);
      } else {
        setError(err instanceof ApiError ? err.message : "Failed to create parent");
      }
    } finally {
      setSubmitting(false);
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    submit(false);
  }

  return (
    <div>
      <PageHeader
        eyebrow="Parents"
        title="Add Parent"
        breadcrumbs={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Parents", href: `/schools/${schoolId}/parents` },
          { label: "Add" },
        ]}
      />

      <div className="mx-auto max-w-lg p-4 sm:p-6">
        <Card>
          {duplicates ? (
            <div className="space-y-4">
              <Alert tone="warning">An existing parent with similar information was found.</Alert>
              <div className="space-y-2">
                {duplicates.map((d) => (
                  <div key={d.id} className="rounded-lg border border-border bg-surface-soft p-3">
                    <p className="font-medium text-foreground">
                      {d.firstName} {d.lastName}
                    </p>
                    <p className="text-sm text-foreground-soft">{d.phone ?? d.email ?? "No contact on file"}</p>
                  </div>
                ))}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  onClick={() => router.push(`/schools/${schoolId}/parents/${duplicates[0].id}`)}
                >
                  Use Existing Parent
                </Button>
                <Button variant="danger" loading={submitting} onClick={() => submit(true)}>
                  Create New Parent Anyway
                </Button>
                <Button variant="ghost" onClick={() => setDuplicates(null)}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <form onSubmit={onSubmit} className="space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <FormField label="Full name" required className="sm:col-span-2">
                  <div className="grid grid-cols-2 gap-2">
                    <Input required placeholder="First name" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
                    <Input required placeholder="Last name" value={lastName} onChange={(e) => setLastName(e.target.value)} />
                  </div>
                </FormField>
                <FormField label="Phone" required>
                  <Input required value={phone} onChange={(e) => setPhone(e.target.value)} />
                </FormField>
                <FormField label="Email">
                  <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
                </FormField>
                <FormField label="Address" className="sm:col-span-2">
                  <Input value={address} onChange={(e) => setAddress(e.target.value)} />
                </FormField>
              </div>

              {error && <Alert tone="danger">{error}</Alert>}

              <p className="text-sm text-foreground-muted">
                After saving, you can link this parent to one or more students from their profile page.
              </p>

              <div className="flex gap-2">
                <Button type="submit" loading={submitting} disabled={!firstName.trim() || !lastName.trim() || !phone.trim()}>
                  Save Parent
                </Button>
                <Button type="button" variant="outline" onClick={() => router.push(`/schools/${schoolId}/parents`)}>
                  Cancel
                </Button>
              </div>
            </form>
          )}
        </Card>
      </div>
    </div>
  );
}
