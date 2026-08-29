"use client";

import { forwardRef } from "react";
import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";

const controlClasses =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition-colors placeholder:text-foreground-muted focus:border-accent focus:ring-2 focus:ring-accent/15 disabled:bg-surface disabled:text-foreground-muted";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className = "", ...props }, ref) => <input ref={ref} className={`${controlClasses} ${className}`} {...props} />,
);
Input.displayName = "Input";

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className = "", children, ...props }, ref) => (
    <select ref={ref} className={`${controlClasses} ${className}`} {...props}>
      {children}
    </select>
  ),
);
Select.displayName = "Select";

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className = "", ...props }, ref) => (
    <textarea ref={ref} className={`${controlClasses} ${className}`} {...props} />
  ),
);
Textarea.displayName = "Textarea";

export function FormField({
  label,
  htmlFor,
  required,
  error,
  hint,
  children,
  className = "",
}: {
  label: string;
  htmlFor?: string;
  required?: boolean;
  error?: string;
  hint?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <label htmlFor={htmlFor} className="block text-sm font-medium text-foreground">
        {label}
        {required && <span className="ml-0.5 text-danger">*</span>}
      </label>
      <div className="mt-1.5">{children}</div>
      {error ? (
        <p className="mt-1 text-xs text-danger">{error}</p>
      ) : hint ? (
        <p className="mt-1 text-xs text-foreground-muted">{hint}</p>
      ) : null}
    </div>
  );
}

export function FieldGroup({ legend, children }: { legend: string; children: ReactNode }) {
  return (
    <fieldset className="border-t border-border pt-5">
      <legend className="mb-3 text-xs font-semibold uppercase tracking-wide text-foreground-muted">{legend}</legend>
      {children}
    </fieldset>
  );
}
