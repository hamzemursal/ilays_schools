"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth, ApiError } from "@/lib/auth-context";
import { api, type DashboardSummary } from "@/lib/api";

export default function SchoolDashboardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: schoolId } = use(params);
  const router = useRouter();
  const { user, accessToken, loading } = useAuth();

  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !user) router.push("/login");
  }, [loading, user, router]);

  useEffect(() => {
    if (!accessToken) return;
    api
      .getDashboardSummary(accessToken, schoolId)
      .then(setSummary)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load dashboard"));
  }, [accessToken, schoolId]);

  if (loading || !user) return <p className="p-8 text-foreground-soft">Loading…</p>;
  if (error) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
        <p className="rounded-lg bg-danger-soft px-4 py-3 text-danger">{error}</p>
      </div>
    );
  }
  if (!summary) return <p className="p-8 text-foreground-soft">Loading…</p>;

  const schoolName = user.schools.find((s) => s.id === schoolId)?.name ?? "School";

  const cards = [
    { label: "Active students", value: summary.studentCount },
    { label: "Teachers", value: summary.teacherCount },
    { label: "Classes", value: summary.classCount },
    {
      label: "Attendance today",
      value: summary.attendanceTodayPercent === null ? "—" : `${summary.attendanceTodayPercent}%`,
      hint: summary.attendanceMarkedCount === 0 ? "Not marked yet" : `${summary.attendanceMarkedCount} marked`,
    },
    {
      label: "Outstanding fees",
      value: `$${summary.outstandingFeesTotal.toFixed(2)}`,
      hint: `${summary.outstandingInvoiceCount} invoice(s)`,
      accent: summary.outstandingFeesTotal > 0,
    },
  ];

  const links = [
    { href: `/schools/${schoolId}/academic`, label: "Academic", show: user.permissions.includes("academic.view") },
    { href: `/schools/${schoolId}/students`, label: "Students", show: user.permissions.includes("students.view") },
    { href: `/schools/${schoolId}/finance`, label: "Finance", show: user.permissions.includes("fees.manage") },
    { href: `/schools/${schoolId}/audit-log`, label: "Audit log", show: user.permissions.includes("audit.view") },
  ].filter((l) => l.show);

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6 sm:py-16">
      <span className="text-sm font-semibold uppercase tracking-wide text-accent">Dashboard</span>
      <h1 className="mt-1 text-2xl font-semibold text-foreground">{schoolName}</h1>

      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {cards.map((c) => (
          <div key={c.label} className="rounded-xl border border-border bg-surface p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-foreground-soft">{c.label}</p>
            <p className={`mt-1 text-2xl font-semibold ${c.accent ? "text-warning" : "text-foreground"}`}>
              {c.value}
            </p>
            {c.hint && <p className="mt-0.5 text-xs text-foreground-soft">{c.hint}</p>}
          </div>
        ))}
      </div>

      <div className="mt-6 space-y-2">
        {links.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className="flex items-center justify-between rounded-xl border border-border bg-surface p-4 hover:border-accent"
          >
            <span className="font-medium text-foreground">{l.label}</span>
            <span className="text-accent">→</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
