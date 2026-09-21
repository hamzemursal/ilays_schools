import Link from "next/link";
import { ExternalLink, Mail, Phone } from "lucide-react";
import type { GuardianRecord } from "@/lib/api";
import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { RelationshipBadge } from "../relationships";

export function GuardianCard({
  guardian,
  schoolId,
  canViewProfile,
}: {
  guardian: GuardianRecord;
  // Both optional so this card still renders identically wherever it was
  // already used without them (e.g. a caller not yet passing school
  // context) — the profile link only appears when both are supplied.
  schoolId?: string;
  canViewProfile?: boolean;
}) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-border bg-background p-4">
      <Avatar name={`${guardian.firstName} ${guardian.lastName}`} size="sm" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-medium text-foreground">
            {guardian.firstName} {guardian.lastName}
          </p>
          <RelationshipBadge relationship={guardian.relationship} />
          {guardian.isPrimaryContact && <Badge tone="success">Primary contact</Badge>}
          {canViewProfile && schoolId && (
            <Link
              href={`/schools/${schoolId}/parents/${guardian.id}`}
              className="inline-flex items-center gap-1 text-sm font-medium text-accent hover:underline"
            >
              View profile <ExternalLink className="size-3" />
            </Link>
          )}
        </div>
        <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-sm text-foreground-soft">
          {guardian.phone && (
            <span className="inline-flex items-center gap-1.5">
              <Phone className="size-3.5" /> {guardian.phone}
            </span>
          )}
          {guardian.email && (
            <span className="inline-flex items-center gap-1.5">
              <Mail className="size-3.5" /> {guardian.email}
            </span>
          )}
          {!guardian.phone && !guardian.email && <span className="text-foreground-muted">No contact on file</span>}
        </div>
      </div>
    </div>
  );
}
