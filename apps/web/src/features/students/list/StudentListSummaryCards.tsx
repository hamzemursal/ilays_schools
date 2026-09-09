"use client";

import { Percent, UserCheck, Users, UsersRound } from "lucide-react";
import type { StudentListItem } from "@/lib/api";
import { Card } from "@/components/ui/Card";

const TONE_CLASSES = {
  accent: "bg-accent-soft text-accent",
  success: "bg-success-soft text-success",
  purple: "bg-purple-50 text-purple-600",
  orange: "bg-orange-50 text-orange-600",
} as const;

function SummaryCard({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: React.ReactNode;
  tone: keyof typeof TONE_CLASSES;
}) {
  return (
    <Card>
      <div className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${TONE_CLASSES[tone]}`}>
        <Icon className="size-5" />
      </div>
      <p className="mt-3 text-2xl font-semibold tabular-nums text-foreground">{value}</p>
      <p className="text-xs font-medium text-foreground-muted">{label}</p>
    </Card>
  );
}

// All figures are derived from exactly the students currently passing every
// active filter — narrowing to Form 1 / Section A recomputes every card to
// that section alone, never the whole school.
export function StudentListSummaryCards({
  students,
  attendanceRates,
}: {
  students: StudentListItem[];
  attendanceRates: Map<string, number | null> | null;
}) {
  const total = students.length;
  const active = students.filter((s) => s.status === "ACTIVE").length;
  const male = students.filter((s) => s.sex === "MALE").length;
  const female = students.filter((s) => s.sex === "FEMALE").length;

  let averageAttendance: number | null = null;
  if (attendanceRates) {
    const rates = students.map((s) => attendanceRates.get(s.enrollmentId)).filter((r): r is number => r !== null && r !== undefined);
    if (rates.length > 0) {
      averageAttendance = Math.round((rates.reduce((sum, r) => sum + r, 0) / rates.length) * 10) / 10;
    }
  }

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      <SummaryCard icon={Users} label="Total Students" value={total} tone="accent" />
      <SummaryCard icon={UserCheck} label="Active" value={active} tone="success" />
      <SummaryCard icon={UsersRound} label="Male" value={male} tone="purple" />
      <SummaryCard icon={UsersRound} label="Female" value={female} tone="orange" />
      {attendanceRates && (
        <SummaryCard
          icon={Percent}
          label="Average Attendance"
          value={averageAttendance !== null ? `${averageAttendance}%` : "—"}
          tone="success"
        />
      )}
    </div>
  );
}
