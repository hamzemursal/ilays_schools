import { Heart, ShieldCheck, User, Users } from "lucide-react";
import type { GuardianRelationship } from "@/lib/api";
import { Badge } from "@/components/ui/Badge";

// The one place guardian relationship labels, icons and the
// "one Mother / one Father per student" rule live in the UI. The backend
// (GuardiansService.linkToStudent) is the authority and refuses a second
// Mother or Father; this only stops the mistake earlier and explains it.
export const RELATIONSHIPS: { value: GuardianRelationship; label: string }[] = [
  { value: "FATHER", label: "Father" },
  { value: "MOTHER", label: "Mother" },
  { value: "GUARDIAN", label: "Guardian" },
  { value: "OTHER", label: "Other relative" },
];

const RELATIONSHIP_STYLE: Record<GuardianRelationship, { tone: "accent" | "success" | "warning" | "neutral"; icon: typeof User }> = {
  MOTHER: { tone: "accent", icon: Heart },
  FATHER: { tone: "success", icon: User },
  GUARDIAN: { tone: "warning", icon: ShieldCheck },
  OTHER: { tone: "neutral", icon: Users },
};

export function relationshipLabel(relationship: GuardianRelationship | string): string {
  return RELATIONSHIPS.find((r) => r.value === relationship)?.label ?? String(relationship);
}

export function RelationshipBadge({ relationship }: { relationship: GuardianRelationship }) {
  const { tone, icon: Icon } = RELATIONSHIP_STYLE[relationship] ?? RELATIONSHIP_STYLE.OTHER;
  return (
    <Badge tone={tone}>
      <Icon className="size-3" />
      {relationshipLabel(relationship)}
    </Badge>
  );
}

// Which single-holder relationships a student already has, mapped to the
// holder's name. Only Mother and Father are limited to one.
export type TakenRelationships = Partial<Record<GuardianRelationship, string>>;

export function takenRelationships(
  existing: { firstName: string; lastName: string; relationship: GuardianRelationship }[] | undefined,
): TakenRelationships {
  const taken: TakenRelationships = {};
  for (const g of existing ?? []) {
    if (g.relationship === "MOTHER" || g.relationship === "FATHER") taken[g.relationship] = `${g.firstName} ${g.lastName}`;
  }
  return taken;
}

export function firstAvailableRelationship(taken: TakenRelationships): GuardianRelationship {
  return RELATIONSHIPS.find((r) => !taken[r.value])?.value ?? "GUARDIAN";
}

// <option>s for a relationship <select>: a taken Mother/Father stays visible
// but disabled and says why, instead of vanishing.
export function RelationshipOptions({ taken = {}, current }: { taken?: TakenRelationships; current?: GuardianRelationship }) {
  return (
    <>
      {RELATIONSHIPS.map((r) => {
        const holder = taken[r.value];
        const blocked = !!holder && r.value !== current;
        return (
          <option key={r.value} value={r.value} disabled={blocked}>
            {blocked ? `${r.label} — already assigned to ${holder}` : r.label}
          </option>
        );
      })}
    </>
  );
}
