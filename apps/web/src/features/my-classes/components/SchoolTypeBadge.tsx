import type { SchoolType } from "@/lib/api";
import { Badge } from "@/components/ui/Badge";
import { DECORATIVE_TONE_CLASSES } from "@/components/ui/decorativeTones";

const LABEL: Record<SchoolType, string> = {
  PRIMARY: "Primary",
  SECONDARY: "Secondary",
  PRIMARY_AND_SECONDARY: "Primary & Secondary",
};

// Primary gets Badge's own accent tone (blue) — already the meaning
// "primary/default" everywhere else in this app. Secondary uses the shared
// violet decorative tone instead of Badge's tone prop, since Badge's own
// tone classes and an appended override aren't guaranteed to win against
// each other in the compiled stylesheet — a plain span with only the
// classes it needs avoids that risk entirely. A combined school gets a
// plain neutral badge rather than inventing a third color for a rarer case.
export function SchoolTypeBadge({ type }: { type: SchoolType }) {
  if (type === "PRIMARY") return <Badge tone="accent">{LABEL[type]}</Badge>;
  if (type === "SECONDARY") {
    return (
      <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap ${DECORATIVE_TONE_CLASSES.violet}`}>
        {LABEL[type]}
      </span>
    );
  }
  return <Badge tone="neutral">{LABEL[type]}</Badge>;
}
