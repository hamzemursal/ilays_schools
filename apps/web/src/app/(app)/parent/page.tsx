"use client";

import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { useSelectedChild } from "@/features/parent-portal/SelectedChildContext";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { EmptyState } from "@/components/ui/EmptyState";
import { SkeletonCards } from "@/components/ui/Skeleton";
import { GraduationCap, Users } from "lucide-react";

export default function ParentDashboardPage() {
  const { user } = useAuth();
  const { children, loading, error, setSelectedChildId } = useSelectedChild();

  return (
    <div>
      <PageHeader
        eyebrow="Parent Portal"
        title={`Welcome, ${user?.email ?? "Parent"}`}
        description="An overview of your children enrolled in Ilays Schools."
      />

      <div className="space-y-5 p-4 sm:p-6">
        {error ? (
          <Alert tone="danger">{error}</Alert>
        ) : loading ? (
          <SkeletonCards count={3} />
        ) : children.length === 0 ? (
          <EmptyState
            icon={Users}
            title="No children linked yet"
            description="Ask your school's admin to link your account to your child's student profile."
          />
        ) : (
          <div>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-foreground-muted">My Children</h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {children.map((c) => (
                <Card key={c.studentId}>
                  <div className="flex items-start gap-3">
                    <div className="flex size-11 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent">
                      <GraduationCap className="size-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold text-foreground">
                        {c.firstName} {c.lastName}
                      </p>
                      {c.enrollment ? (
                        <p className="mt-0.5 text-sm text-foreground-soft">
                          {c.enrollment.className} · {c.enrollment.sectionName}
                        </p>
                      ) : (
                        <p className="mt-0.5 text-sm text-foreground-muted">Not currently enrolled</p>
                      )}
                      {c.enrollment && (
                        <p className="mt-0.5 text-xs text-foreground-muted">{c.enrollment.academicYearName}</p>
                      )}
                      <div className="mt-2">
                        <Badge tone={c.currentStatus === "ACTIVE" ? "success" : "neutral"}>{c.currentStatus}</Badge>
                      </div>
                    </div>
                  </div>
                  <Link href="/parent/children" className="mt-4 block" onClick={() => setSelectedChildId(c.studentId)}>
                    <Button size="sm" variant="outline" className="w-full">
                      View
                    </Button>
                  </Link>
                </Card>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
