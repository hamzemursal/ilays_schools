import { AlertTriangle, CheckCircle2, Info, XCircle } from "lucide-react";

type Tone = "success" | "danger" | "warning" | "info";

const config: Record<Tone, { icon: typeof Info; bg: string; text: string }> = {
  success: { icon: CheckCircle2, bg: "bg-success-soft", text: "text-success" },
  danger: { icon: XCircle, bg: "bg-danger-soft", text: "text-danger" },
  warning: { icon: AlertTriangle, bg: "bg-warning-soft", text: "text-warning" },
  info: { icon: Info, bg: "bg-accent-soft", text: "text-accent" },
};

export function Alert({
  tone = "info",
  children,
  className = "",
}: {
  tone?: Tone;
  children: React.ReactNode;
  className?: string;
}) {
  const { icon: Icon, bg, text } = config[tone];
  return (
    <div className={`flex items-start gap-2.5 rounded-lg px-3.5 py-3 text-sm ${bg} ${text} ${className}`}>
      <Icon className="mt-0.5 size-4 shrink-0" />
      <div className="min-w-0">{children}</div>
    </div>
  );
}
