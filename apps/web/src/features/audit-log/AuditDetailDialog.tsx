"use client";

import { useEffect } from "react";
import { X } from "lucide-react";
import type { AuditEvent } from "@/lib/api";
import { AuditSeverityBadge, AuditStatusBadge } from "./AuditBadges";
import { diffChanges, formatActionLabel, formatAuditDateTimeSeconds } from "./format";

export function AuditDetailDialog({
  event,
  onClose,
  schoolName,
}: {
  event: AuditEvent | null;
  onClose: () => void;
  schoolName?: string;
}) {
  useEffect(() => {
    if (!event) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [event, onClose]);

  if (!event) return null;

  const changes = diffChanges(event.before, event.after);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-foreground/30 px-4 py-8" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-2xl rounded-xl border border-border bg-background shadow-lg"
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="font-semibold text-foreground">Audit Event Details</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg p-1.5 text-foreground-muted hover:bg-surface-hover hover:text-foreground"
          >
            <X className="size-4.5" />
          </button>
        </div>

        <div className="max-h-[70vh] space-y-5 overflow-y-auto px-5 py-5">
          <Section title="Who">
            <Field label="Name" value={event.actorNameSnapshot ?? "—"} />
            <Field label="Email" value={event.actorEmailSnapshot ?? "(system)"} />
            <Field label="Role" value={event.actorRoleSnapshot ?? "—"} />
            <Field label="User ID" value={event.actorUserId ?? "—"} mono />
          </Section>

          <Section title="What">
            <Field label="Action" value={formatActionLabel(event.action)} />
            <Field label="Module" value={event.module ?? "—"} />
            <div className="flex items-center gap-2 py-1">
              <span className="w-28 shrink-0 text-xs font-medium uppercase tracking-wide text-foreground-muted">Status</span>
              <AuditStatusBadge status={event.status} />
            </div>
            <div className="flex items-center gap-2 py-1">
              <span className="w-28 shrink-0 text-xs font-medium uppercase tracking-wide text-foreground-muted">Severity</span>
              <AuditSeverityBadge severity={event.severity} />
            </div>
          </Section>

          <Section title="Which">
            <Field label="Resource" value={event.resource} />
            <Field label="Resource ID" value={event.resourceId ?? "—"} mono />
            <Field label="Resource Name" value={event.resourceNameSnapshot ?? "—"} />
          </Section>

          <Section title="When">
            <Field label="Timestamp" value={formatAuditDateTimeSeconds(event.createdAt)} />
          </Section>

          {(event.schoolId || schoolName) && (
            <Section title="School">
              <Field label="School" value={schoolName ?? "—"} />
              <Field label="School ID" value={event.schoolId ?? "—"} mono />
            </Section>
          )}

          <Section title="Technical">
            <Field label="IP Address" value={event.ipAddress ?? "—"} mono />
            <Field label="User Agent" value={event.userAgent ?? "—"} />
            <Field label="Request ID" value={event.requestId ?? "—"} mono />
          </Section>

          {changes.length > 0 && (
            <Section title="Changes">
              <div className="overflow-x-auto rounded-lg border border-border">
                <table className="w-full text-left text-sm">
                  <thead className="bg-surface-soft">
                    <tr>
                      <th className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-foreground-muted">Field</th>
                      <th className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-foreground-muted">Before</th>
                      <th className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-foreground-muted">After</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {changes.map((c) => (
                      <tr key={c.field}>
                        <td className="px-3 py-2 align-top font-medium text-foreground">{c.field}</td>
                        <td className="px-3 py-2 align-top text-foreground-soft">{c.before}</td>
                        <td className="px-3 py-2 align-top text-foreground-soft">{c.after}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Section>
          )}

          {event.reason && (
            <Section title="Reason">
              <p className="text-sm text-foreground-soft">{event.reason}</p>
            </Section>
          )}
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-accent">{title}</h3>
      <div className="space-y-0.5 border-t border-border pt-2">{children}</div>
    </div>
  );
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-start gap-2 py-1 text-sm">
      <span className="w-28 shrink-0 text-xs font-medium uppercase tracking-wide text-foreground-muted">{label}</span>
      <span className={`min-w-0 flex-1 break-words text-foreground ${mono ? "font-mono text-xs" : ""}`}>{value}</span>
    </div>
  );
}
