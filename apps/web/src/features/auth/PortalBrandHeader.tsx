import { GraduationCap, type LucideIcon } from "lucide-react";

// The one branding block shared by every public entry point — /portal and
// all four */login pages — so a role-specific icon/subtitle never has to
// redraw the logo, spacing, or typography from scratch.
export function PortalBrandHeader({
  title = "Ilays Schools",
  subtitle,
  icon: Icon = GraduationCap,
}: {
  title?: string;
  subtitle: string;
  icon?: LucideIcon;
}) {
  return (
    <div className="mb-8 flex flex-col items-center text-center">
      <div className="flex size-12 items-center justify-center rounded-xl bg-accent text-white shadow-md">
        <Icon className="size-6" />
      </div>
      <h1 className="mt-4 text-xl font-semibold text-foreground">{title}</h1>
      <p className="mt-1 text-sm text-foreground-soft">{subtitle}</p>
    </div>
  );
}
