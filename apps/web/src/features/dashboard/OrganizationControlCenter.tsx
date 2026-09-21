"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowRight,
  BookUser,
  Briefcase,
  Building2,
  CheckCircle2,
  History,
  Info,
  LayoutGrid,
  ShieldCheck,
  Users,
} from "lucide-react";
import { useAuth, ApiError } from "@/lib/auth-context";
import { api, type School, type SchoolType, type SystemSummary, type SystemSummaryActivity } from "@/lib/api";
import { StatCard } from "@/components/ui/StatCard";
import { Card, CardHeader } from "@/components/ui/Card";
import { Alert } from "@/components/ui/Alert";
import { EmptyState } from "@/components/ui/EmptyState";
import { SkeletonCards } from "@/components/ui/Skeleton";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/FormControls";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { SchoolTypeBadge } from "@/features/my-classes/components/SchoolTypeBadge";

// The Super Admin's landing page: an ORGANIZATION control center, not a
// "welcome back" page. Everything on it is real - the same
// getSystemSummary (SchoolsService.getSystemSummary) the previous dashboard
// used, so no endpoint, contract or number was added: four organization
// totals, the real schools table, real recent audit entries and real setup
// alerts. Nothing is simulated: no trends, growth percentages or invented
// activity. Rendered by dashboard/page.tsx only for the SUPER_ADMIN role.

// "RESULTS_PUBLISHED" / "school.create" -> "Results published" / "School create".
// The audit trail's own action string, made readable - never rewritten into
// something it does not say.
const ACRONYMS = new Set(["totp", "id", "pdf", "csv", "hr"]);

export function humanizeAction(action: string): string {
  const words = action
    .replace(/[._]+/g, " ")
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .map((w) => (ACRONYMS.has(w) ? w.toUpperCase() : w));
  const text = words.join(" ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function relativeTime(iso: string, now: Date = new Date()): string {
  const then = new Date(iso);
  const seconds = Math.round((now.getTime() - then.getTime()) / 1000);
  if (seconds < 45) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} ${hours === 1 ? "hour" : "hours"} ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} ${days === 1 ? "day" : "days"} ago`;
  return then.toLocaleDateString();
}

const TYPE_OPTIONS: { value: "" | SchoolType; label: string }[] = [
  { value: "", label: "All types" },
  { value: "PRIMARY", label: "Primary" },
  { value: "SECONDARY", label: "Secondary" },
  { value: "PRIMARY_AND_SECONDARY", label: "Primary & Secondary" },
];

const STATUS_OPTIONS: { value: "" | School["status"]; label: string }[] = [
  { value: "", label: "All statuses" },
  { value: "ACTIVE", label: "Active" },
  { value: "INACTIVE", label: "Inactive" },
];

export function OrganizationControlCenter() {
  const { accessToken } = useAuth();
  const [summary, setSummary] = useState<SystemSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken) return;
    api
      .getSystemSummary(accessToken)
      .then(setSummary)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load the organization overview"));
  }, [accessToken]);

  return (
    <div className="space-y-6">
      <Hero />

      {error ? (
        <Alert tone="danger">{error}</Alert>
      ) : !summary ? (
        <SkeletonCards count={4} />
      ) : (
        <>
          <SummaryCards summary={summary} />
          <SchoolsOverview schools={summary.schools} />
          <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-2">
            <RecentActivity activity={summary.recentActivity} schools={summary.schools} />
            <SystemAlerts alerts={summary.alerts} />
          </div>
        </>
      )}
    </div>
  );
}

function Hero() {
  return (
    <Card padding="none" className="overflow-hidden">
      <div className="flex flex-col gap-6 p-6 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0 lg:max-w-xl">
          <p className="text-xs font-semibold uppercase tracking-wider text-accent">Organization overview</p>
          <h1 className="mt-1.5 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">Super Admin Command Center</h1>
          <p className="mt-2 text-base text-foreground-soft">Manage and monitor all Ilays Schools from one place.</p>
          <ul className="mt-5 flex flex-wrap gap-x-6 gap-y-2 text-sm text-foreground-soft">
            <li className="flex items-center gap-2">
              <Building2 className="size-4 text-accent" />
              Multi-school management
            </li>
            <li className="flex items-center gap-2">
              <LayoutGrid className="size-4 text-accent" />
              Centralized control
            </li>
            <li className="flex items-center gap-2">
              <ShieldCheck className="size-4 text-accent" />
              Security &amp; governance
            </li>
          </ul>
        </div>

        <OrganizationIllustration />

        <div className="flex shrink-0 items-center gap-4 rounded-xl border border-border bg-surface p-4 lg:w-80">
          <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent">
            <Building2 className="size-5" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground">All Schools</p>
            <p className="text-xs text-foreground-soft">Complete overview of your organization.</p>
            <Link href="/schools" className="mt-2 inline-block">
              <Button size="sm" icon={<ArrowRight className="size-4" />}>
                View Schools
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </Card>
  );
}

// A small, purely decorative building drawn in inline SVG (no asset, no
// dependency). Hidden from assistive tech and from narrow screens.
function OrganizationIllustration() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 220 120"
      className="hidden h-28 w-auto shrink-0 xl:block"
      fill="none"
    >
      <ellipse cx="110" cy="108" rx="96" ry="8" fill="#EEF2FF" />
      <rect x="62" y="44" width="96" height="62" rx="3" fill="#FFFFFF" stroke="#C7D2FE" strokeWidth="2" />
      <path d="M52 46 110 16l58 30Z" fill="#4F46E5" />
      <rect x="98" y="10" width="2.5" height="10" fill="#4338CA" />
      <rect x="100" y="10" width="14" height="7" rx="1" fill="#06B6D4" />
      {[74, 94, 114, 134].map((x) => (
        <rect key={x} x={x} y="56" width="12" height="14" rx="1.5" fill="#E0E7FF" />
      ))}
      {[74, 134].map((x) => (
        <rect key={x} x={x} y="78" width="12" height="14" rx="1.5" fill="#E0E7FF" />
      ))}
      <rect x="99" y="82" width="22" height="24" rx="2" fill="#4F46E5" />
      <rect x="28" y="70" width="18" height="36" rx="2" fill="#E0E7FF" />
      <rect x="174" y="76" width="18" height="30" rx="2" fill="#E0E7FF" />
      <circle cx="36" cy="60" r="10" fill="#A5F3FC" />
      <circle cx="184" cy="66" r="9" fill="#A5F3FC" />
    </svg>
  );
}

function SummaryCards({ summary }: { summary: SystemSummary }) {
  const { totals } = summary;
  return (
    <section aria-label="Organization summary">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={Building2}
          label="Total schools"
          value={totals.schools}
          hint={`${totals.activeSchools} active${totals.inactiveSchools > 0 ? ` · ${totals.inactiveSchools} inactive` : ""}`}
        />
        <StatCard
          icon={Users}
          label="Total students"
          value={totals.students}
          tone="teal"
          hint={`${totals.maleStudents} male · ${totals.femaleStudents} female`}
        />
        <StatCard icon={BookUser} label="Total teachers" value={totals.teachers} tone="violet" />
        <StatCard icon={Briefcase} label="Total staff" value={totals.staff} tone="amber" />
      </div>
      <p className="mt-3 text-xs text-foreground-muted" title="A school offering both divisions counts as both Primary and Secondary.">
        Primary schools {totals.primarySchools} · Secondary schools {totals.secondarySchools} · Parents / guardians {totals.guardians}
      </p>
    </section>
  );
}

function StatusPill({ status }: { status: School["status"] }) {
  const active = status === "ACTIVE";
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-sm font-medium">
      {/* Brand emerald for the dot; a darker shade for the text so it stays readable. */}
      <span className={`size-2 rounded-full ${active ? "bg-[#10b981]" : "bg-slate-400"}`} />
      <span className={active ? "text-success" : "text-foreground-soft"}>{active ? "Active" : "Inactive"}</span>
    </span>
  );
}

function SchoolsOverview({ schools }: { schools: School[] }) {
  const router = useRouter();
  const [type, setType] = useState<"" | SchoolType>("");
  const [status, setStatus] = useState<"" | School["status"]>("");

  const filtered = useMemo(
    () => schools.filter((s) => (!type || s.type === type) && (!status || s.status === status)),
    [schools, type, status],
  );

  const columns: Column<School>[] = [
    {
      key: "name",
      header: "School",
      sortValue: (s) => s.name,
      className: "min-w-[190px]",
      render: (s) => <span className="font-medium text-foreground">{s.name}</span>,
    },
    { key: "type", header: "Type", sortValue: (s) => s.type, className: "whitespace-nowrap", render: (s) => <SchoolTypeBadge type={s.type} /> },
    { key: "students", header: "Students", sortValue: (s) => s.studentCount, render: (s) => <span className="tabular-nums">{s.studentCount}</span> },
    { key: "teachers", header: "Teachers", sortValue: (s) => s.teacherCount, render: (s) => <span className="tabular-nums">{s.teacherCount}</span> },
    { key: "staff", header: "Staff", sortValue: (s) => s.staffCount, render: (s) => <span className="tabular-nums">{s.staffCount}</span> },
    { key: "status", header: "Status", sortValue: (s) => s.status, render: (s) => <StatusPill status={s.status} /> },
    {
      key: "actions",
      header: "Actions",
      className: "whitespace-nowrap",
      render: (s) => (
        <Link href={`/schools/${s.id}`} onClick={(e) => e.stopPropagation()}>
          <Button size="sm" variant="outline">
            View School
          </Button>
        </Link>
      ),
    },
  ];

  return (
    <Card padding="none">
      <CardHeader
        title="Schools Overview"
        description="All schools in your organization."
        actions={
          <Link href="/schools" className="text-sm font-medium text-accent hover:underline">
            View All
          </Link>
        }
      />
      <div className="p-5">
        <DataTable
          data={filtered}
          columns={columns}
          rowKey={(s) => s.id}
          onRowClick={(s) => router.push(`/schools/${s.id}`)}
          searchPlaceholder="Search schools by name…"
          searchFilter={(s, q) => s.name.toLowerCase().includes(q)}
          emptyTitle={schools.length === 0 ? "No schools yet" : "No schools match these filters"}
          emptyDescription={schools.length === 0 ? "Create a school to see it here." : "Try a different type or status."}
          pagination={{ pageSizeOptions: [5, 10, 25], defaultPageSize: 5, itemLabel: "schools" }}
          toolbar={
            <>
              <Select aria-label="Filter by school type" value={type} onChange={(e) => setType(e.target.value as "" | SchoolType)} className="!w-auto">
                {TYPE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>
              <Select
                aria-label="Filter by status"
                value={status}
                onChange={(e) => setStatus(e.target.value as "" | School["status"])}
                className="!w-auto"
              >
                {STATUS_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>
            </>
          }
        />
      </div>
    </Card>
  );
}

function RecentActivity({ activity, schools }: { activity: SystemSummaryActivity[]; schools: School[] }) {
  const schoolName = (id: string | null) => schools.find((s) => s.id === id)?.name ?? null;
  return (
    <Card padding="none">
      <CardHeader
        title="Recent Activity / Audit"
        description="Latest actions across all schools."
        actions={
          <Link href="/audit-log" className="text-sm font-medium text-accent hover:underline">
            View All
          </Link>
        }
      />
      <div className="p-5">
        {activity.length === 0 ? (
          <EmptyState icon={History} title="No activity yet" />
        ) : (
          <ul className="divide-y divide-border">
            {activity.slice(0, 6).map((entry) => {
              const school = schoolName(entry.schoolId);
              return (
                <li key={entry.id} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
                  <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent">
                    <History className="size-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground">{humanizeAction(entry.action)}</p>
                    <p className="truncate text-xs text-foreground-soft">
                      {school ? `${school} · ` : ""}by {entry.actorEmail}
                    </p>
                  </div>
                  <time className="shrink-0 text-xs text-foreground-muted" dateTime={entry.createdAt} title={new Date(entry.createdAt).toLocaleString()}>
                    {relativeTime(entry.createdAt)}
                  </time>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Card>
  );
}

function SystemAlerts({ alerts }: { alerts: SystemSummary["alerts"] }) {
  return (
    <Card padding="none">
      <CardHeader title="System alerts" description="Setup gaps worth a look." />
      <div className="p-5">
        {alerts.length === 0 ? (
          <EmptyState icon={CheckCircle2} title="All clear" description="No setup gaps detected across your schools." />
        ) : (
          <ul className="space-y-2">
            {alerts.slice(0, 6).map((alert, i) => (
              <li key={i} className="flex items-start gap-2 text-sm">
                {alert.severity === "warning" ? (
                  <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
                ) : (
                  <Info className="mt-0.5 size-4 shrink-0 text-foreground-muted" />
                )}
                <Link href={`/schools/${alert.schoolId}`} className="text-foreground-soft hover:text-accent hover:underline">
                  {alert.message}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}
