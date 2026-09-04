import { Badge } from "@/components/ui/Badge";
import type { LifecycleRowState } from "./state";

export function LifecycleStatusBadge({ state }: { state: LifecycleRowState }) {
  return <Badge tone={state.statusTone}>{state.statusLabel}</Badge>;
}
