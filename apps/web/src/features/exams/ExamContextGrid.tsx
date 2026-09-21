import type { ReactNode } from "react";

// The exam a set of marks belongs to, spelled out: shown on the results page
// and repeated in the Submit for Review dialog so a teacher can never submit
// (or an admin review) marks without seeing exactly which exam, class,
// section, term and limits they are for. Maximum Marks and Pass Mark are
// set by an Admin and are read-only here.
export interface ExamContext {
  examName: string;
  subjectName: string;
  className: string;
  sectionName: string;
  academicYearName: string;
  termName: string | null | undefined;
  examDate: string | null;
  maxMarks: number;
  passingMark: number | null | undefined;
}

function Item({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-medium uppercase tracking-wide text-foreground-muted">{label}</dt>
      <dd className="mt-0.5 truncate text-sm font-medium text-foreground">{children}</dd>
    </div>
  );
}

export function ExamContextGrid({
  context,
  status,
  compact = false,
}: {
  context: ExamContext;
  status?: ReactNode;
  compact?: boolean;
}) {
  return (
    <dl className={`grid gap-x-5 gap-y-3 ${compact ? "grid-cols-2" : "grid-cols-2 sm:grid-cols-3"}`}>
      <Item label="Exam Name">{context.examName}</Item>
      <Item label="Subject">{context.subjectName}</Item>
      <Item label="Class">{context.className}</Item>
      <Item label="Section">{context.sectionName}</Item>
      <Item label="Academic Year">{context.academicYearName}</Item>
      <Item label="Term">{context.termName ?? "No term assigned"}</Item>
      <Item label="Exam Date">{context.examDate ? new Date(context.examDate).toLocaleDateString() : "Not set"}</Item>
      <Item label="Maximum Marks">{context.maxMarks}</Item>
      <Item label="Pass Mark">{context.passingMark ?? "Not set"}</Item>
      {status !== undefined && <Item label="Status">{status}</Item>}
    </dl>
  );
}
