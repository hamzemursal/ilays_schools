"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";

export default function DashboardPage() {
  const router = useRouter();
  const { user, loading, logout } = useAuth();

  useEffect(() => {
    if (!loading && !user) router.push("/login");
  }, [loading, user, router]);

  if (loading || !user) {
    return <p className="p-8 text-foreground-soft">Loading…</p>;
  }

  // Checking the TEACHER role specifically, not the attendance.mark /
  // results.enter permissions — School Admin holds those too (so they can
  // act on any class in their school), but "My classes" means "the classes
  // I'm personally assigned to teach," which only applies to an actual
  // Teacher profile.
  const isTeacher = user.roles.includes("TEACHER");

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-10 sm:px-6 sm:py-16">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <span className="text-sm font-semibold uppercase tracking-wide text-accent">Dashboard</span>
          <h1 className="mt-1 break-words text-2xl font-semibold text-foreground">{user.email}</h1>
        </div>
        <button
          onClick={async () => {
            await logout();
            router.push("/login");
          }}
          className="shrink-0 rounded-lg border border-border px-3 py-1.5 text-sm text-foreground-soft hover:text-foreground"
        >
          Sign out
        </button>
      </div>

      {isTeacher && (
        <Link
          href="/my-classes"
          className="mt-6 flex items-center justify-between rounded-xl border border-border bg-surface p-5 hover:border-accent"
        >
          <span className="font-medium text-foreground">My classes</span>
          <span className="text-accent">→</span>
        </Link>
      )}

      <div className="mt-4 rounded-xl border border-border bg-surface p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-foreground-soft">Roles</h2>
        <div className="mt-2 flex flex-wrap gap-2">
          {user.roles.map((role) => (
            <span key={role} className="rounded-full bg-accent-soft px-3 py-1 text-sm font-medium text-accent">
              {role}
            </span>
          ))}
        </div>
      </div>

      <div className="mt-4 rounded-xl border border-border bg-surface p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-foreground-soft">
          Authorized schools
        </h2>
        {user.schools.length === 0 ? (
          <p className="mt-2 text-sm text-foreground-soft">
            None — this account isn&apos;t scoped to a specific school (organization-wide access).
          </p>
        ) : (
          <ul className="mt-2 space-y-2">
            {user.schools.map((school) => (
              <li key={school.id} className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="text-foreground">{school.name}</span>
                {user.permissions.includes("academic.view") && (
                  <Link href={`/schools/${school.id}/dashboard`} className="text-sm text-accent hover:underline">
                    Dashboard
                  </Link>
                )}
                {user.permissions.includes("academic.view") && (
                  <Link href={`/schools/${school.id}/academic`} className="text-sm text-accent hover:underline">
                    Academic
                  </Link>
                )}
                {user.permissions.includes("students.view") && (
                  <Link href={`/schools/${school.id}/students`} className="text-sm text-accent hover:underline">
                    Students
                  </Link>
                )}
                {(user.permissions.includes("fees.manage") || user.permissions.includes("payments.record")) && (
                  <Link href={`/schools/${school.id}/finance`} className="text-sm text-accent hover:underline">
                    Finance
                  </Link>
                )}
                {user.permissions.includes("audit.view") && (
                  <Link href={`/schools/${school.id}/audit-log`} className="text-sm text-accent hover:underline">
                    Audit log
                  </Link>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="mt-4 rounded-xl border border-border bg-surface p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-foreground-soft">Permissions</h2>
        <p className="mt-2 text-sm text-foreground-soft">{user.permissions.length} granted</p>
      </div>

      {user.permissions.includes("schools.view") && (
        <Link
          href="/schools"
          className="mt-4 flex items-center justify-between rounded-xl border border-border bg-surface p-5 hover:border-accent"
        >
          <span className="font-medium text-foreground">Manage schools</span>
          <span className="text-accent">→</span>
        </Link>
      )}
    </div>
  );
}
