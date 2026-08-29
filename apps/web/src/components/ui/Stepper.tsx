import { Check } from "lucide-react";

export interface StepDef {
  label: string;
}

export function Stepper({ steps, currentIndex }: { steps: StepDef[]; currentIndex: number }) {
  return (
    <ol className="flex items-center overflow-x-auto">
      {steps.map((step, i) => {
        const state = i < currentIndex ? "done" : i === currentIndex ? "active" : "upcoming";
        return (
          <li key={step.label} className="flex shrink-0 items-center last:flex-none">
            <div className="flex items-center gap-2">
              <span
                className={`flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                  state === "done"
                    ? "bg-accent text-white"
                    : state === "active"
                      ? "border-2 border-accent text-accent"
                      : "border border-border text-foreground-muted"
                }`}
              >
                {state === "done" ? <Check className="size-4" /> : i + 1}
              </span>
              <span
                className={`whitespace-nowrap text-sm font-medium ${
                  state === "upcoming" ? "text-foreground-muted" : "text-foreground"
                }`}
              >
                {step.label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div className={`mx-3 h-px w-8 shrink-0 sm:w-16 ${state === "done" ? "bg-accent" : "bg-border"}`} />
            )}
          </li>
        );
      })}
    </ol>
  );
}
