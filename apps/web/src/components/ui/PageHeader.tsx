import Link from "next/link";
import { ChevronRight } from "lucide-react";

export interface Crumb {
  label: string;
  href?: string;
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  breadcrumbs,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: React.ReactNode;
  breadcrumbs?: Crumb[];
}) {
  return (
    <div className="border-b border-border bg-background px-4 py-5 sm:px-6 sm:py-6">
      {breadcrumbs && breadcrumbs.length > 0 && (
        <nav className="mb-2 flex items-center gap-1 text-xs text-foreground-muted">
          {breadcrumbs.map((c, i) => (
            <span key={i} className="flex items-center gap-1">
              {i > 0 && <ChevronRight className="size-3" />}
              {c.href ? (
                <Link href={c.href} className="hover:text-accent hover:underline">
                  {c.label}
                </Link>
              ) : (
                <span className="text-foreground-soft">{c.label}</span>
              )}
            </span>
          ))}
        </nav>
      )}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          {eyebrow && (
            <span className="text-xs font-semibold uppercase tracking-wide text-accent">{eyebrow}</span>
          )}
          <h1 className="mt-0.5 truncate text-xl font-semibold text-foreground sm:text-2xl">{title}</h1>
          {description && <p className="mt-1 text-sm text-foreground-soft">{description}</p>}
        </div>
        {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}
