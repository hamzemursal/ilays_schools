"use client";

// Same inline underline-tab pattern already used by the Student/Parent Portal
// Fees pages — extracted here since Finance (and Payroll) need the same bar
// across several tabs.
export function TabBar<T extends string>({ tabs, active, onChange }: { tabs: T[]; active: T; onChange: (tab: T) => void }) {
  return (
    <div className="border-b border-border px-4 sm:px-6">
      <div className="flex gap-1 overflow-x-auto">
        {tabs.map((t) => (
          <button
            key={t}
            onClick={() => onChange(t)}
            className={`shrink-0 border-b-2 px-3 py-3 text-sm font-medium transition-colors ${
              active === t ? "border-accent text-accent" : "border-transparent text-foreground-soft hover:text-foreground"
            }`}
          >
            {t}
          </button>
        ))}
      </div>
    </div>
  );
}
