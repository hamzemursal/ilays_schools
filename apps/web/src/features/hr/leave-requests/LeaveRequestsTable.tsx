"use client";

import type { LeaveRequest } from "@/lib/api";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Check, X } from "lucide-react";

const STATUS_TONE: Record<LeaveRequest["status"], "success" | "warning" | "danger" | "neutral"> = {
  PENDING: "warning",
  APPROVED: "success",
  REJECTED: "danger",
  CANCELLED: "neutral",
};

const TYPE_LABEL: Record<LeaveRequest["type"], string> = {
  ANNUAL: "Annual",
  SICK: "Sick",
  UNPAID: "Unpaid",
  OTHER: "Other",
};

function employeeName(r: LeaveRequest): string {
  const person = r.teacher ?? r.staff;
  return person ? `${person.firstName} ${person.lastName}` : "—";
}

export function LeaveRequestsTable({
  requests,
  loading,
  canApprove,
  onApprove,
  onReject,
}: {
  requests: LeaveRequest[] | null;
  loading?: boolean;
  canApprove: boolean;
  onApprove: (r: LeaveRequest) => void;
  onReject: (r: LeaveRequest) => void;
}) {
  const columns: Column<LeaveRequest>[] = [
    {
      key: "employee",
      header: "Employee",
      sortValue: employeeName,
      render: (r) => (
        <div>
          <p className="font-medium text-foreground">{employeeName(r)}</p>
          <p className="text-xs text-foreground-muted">{r.teacher ? "Teacher" : "Staff"}</p>
        </div>
      ),
    },
    {
      key: "type",
      header: "Type",
      render: (r) => <span className="text-foreground-soft">{TYPE_LABEL[r.type]}</span>,
    },
    {
      key: "dates",
      header: "Dates",
      render: (r) => (
        <span className="text-foreground-soft">
          {new Date(r.startDate).toLocaleDateString()} – {new Date(r.endDate).toLocaleDateString()}
        </span>
      ),
    },
    {
      key: "reason",
      header: "Reason",
      render: (r) => <span className="truncate text-foreground-soft">{r.reason ?? "—"}</span>,
    },
    {
      key: "status",
      header: "Status",
      sortValue: (r) => r.status,
      render: (r) => <Badge tone={STATUS_TONE[r.status]}>{r.status}</Badge>,
    },
    ...(canApprove
      ? [
          {
            key: "actions",
            header: "",
            render: (r: LeaveRequest) =>
              r.status === "PENDING" ? (
                <div className="flex gap-1.5" onClick={(e) => e.stopPropagation()}>
                  <Button size="sm" variant="outline" icon={<Check className="size-3.5" />} onClick={() => onApprove(r)}>
                    Approve
                  </Button>
                  <Button size="sm" variant="ghost" icon={<X className="size-3.5" />} onClick={() => onReject(r)}>
                    Reject
                  </Button>
                </div>
              ) : null,
          } satisfies Column<LeaveRequest>,
        ]
      : []),
  ];

  return (
    <DataTable
      data={requests}
      loading={loading}
      columns={columns}
      rowKey={(r) => r.id}
      searchPlaceholder="Search by employee name…"
      searchFilter={(r, q) => employeeName(r).toLowerCase().includes(q)}
      emptyTitle="No leave requests"
      emptyDescription="Leave requests submitted for this school will show up here."
    />
  );
}
