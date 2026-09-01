import Link from "next/link";
import { ArrowRight, GraduationCap, Users } from "lucide-react";
import { PortalBrandHeader } from "@/features/auth/PortalBrandHeader";

// The only publicly-presented entry point. Admin/Staff and Teacher sign-in
// deliberately have no link from here — they're real, working routes
// (/admin/login, /teacher/login), just never advertised to the public. That
// omission is a UX choice, not the security boundary: every actual
// protection is enforced server-side regardless of how a page is reached.
const AUDIENCES = [
  {
    href: "/student/login",
    icon: GraduationCap,
    title: "Student Portal",
    description: "View your academic information, attendance, and results.",
  },
  {
    href: "/parent/login",
    icon: Users,
    title: "Parent Portal",
    description: "View your children's academic information, attendance, and payments.",
  },
];

export default function PublicPortalPage() {
  return (
    <div>
      <PortalBrandHeader subtitle="School Portal" />
      <p className="mb-5 text-center text-sm text-foreground-soft">Access your school account</p>

      <div className="space-y-3">
        {AUDIENCES.map((a) => (
          <Link
            key={a.href}
            href={a.href}
            className="group flex items-start gap-3 rounded-xl border border-border bg-background p-4 shadow-sm transition-colors hover:border-accent"
          >
            <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent">
              <a.icon className="size-5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-foreground">{a.title}</p>
              <p className="mt-0.5 text-sm text-foreground-soft">{a.description}</p>
            </div>
            <ArrowRight className="mt-2.5 size-4 shrink-0 text-foreground-muted transition-transform group-hover:translate-x-0.5 group-hover:text-accent" />
          </Link>
        ))}
      </div>
    </div>
  );
}
