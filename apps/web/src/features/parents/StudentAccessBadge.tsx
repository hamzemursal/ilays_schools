import type { StudentAccess } from "@/lib/api";
import { Badge } from "@/components/ui/Badge";

// A parent's relationship to CURRENT students — deliberately separate from
// their portal account status (an ACTIVE account can have Former Students Only).
const ACCESS: Record<StudentAccess, { label: string; tone: "success" | "warning" | "danger" }> = {
  ACTIVE_STUDENT: { label: "Active Student", tone: "success" },
  FORMER_STUDENTS_ONLY: { label: "Former Students Only", tone: "warning" },
  NO_LINKED_STUDENT: { label: "No Linked Student", tone: "danger" },
};

export function StudentAccessBadge({ access }: { access: StudentAccess | undefined }) {
  if (!access) return null;
  const a = ACCESS[access];
  return <Badge tone={a.tone}>{a.label}</Badge>;
}
