import { ArrowRight, Lock } from "lucide-react";

const STEPS = ["Class 8", "Primary Completed", "Awaiting Next Enrollment", "Form 1 Transition", "Active Form 1"];

// Purely explanatory — makes the two-step, never-automatic rule visible
// rather than just documented. The lock between "Awaiting" and "Form 1
// Transition" is the one edge in this diagram that never happens on its
// own: it only ever fires from an explicit admin action in the wizard.
export function WorkflowDiagram() {
  return (
    <div className="rounded-xl border border-border bg-surface-soft p-4 sm:p-5">
      <div className="flex flex-wrap items-center gap-x-1 gap-y-3">
        {STEPS.map((step, i) => (
          <div key={step} className="flex items-center">
            <span className="whitespace-nowrap rounded-lg border border-border bg-background px-3 py-1.5 text-sm font-medium text-foreground shadow-sm">
              {step}
            </span>
            {i < STEPS.length - 1 &&
              (i === 2 ? (
                <span className="mx-2 flex items-center gap-1 text-xs font-medium text-warning">
                  <Lock className="size-3.5" />
                  <ArrowRight className="size-4" />
                </span>
              ) : (
                <ArrowRight className="mx-2 size-4 shrink-0 text-foreground-muted" />
              ))}
          </div>
        ))}
      </div>
      <p className="mt-3 text-xs text-foreground-soft">
        Completing Class 8 never automatically enrolls a student into Form 1 — even at a school with both divisions.
        Form 1 Transition is always a separate, explicit action.
      </p>
    </div>
  );
}
