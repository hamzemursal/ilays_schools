import Link from "next/link";
import { GraduationCap } from "lucide-react";
import { PortalBrandHeader } from "@/features/auth/PortalBrandHeader";
import { LoginForm } from "@/features/auth/LoginForm";

export default function StudentLoginPage() {
  return (
    <div>
      <PortalBrandHeader subtitle="Student Portal" icon={GraduationCap} />
      <LoginForm identifierLabel="Student Login ID" identifierPlaceholder="STU-2027-00003" redirectTo="/student" />
      <Link href="/portal" className="mt-4 block text-center text-sm text-foreground-muted hover:text-accent hover:underline">
        ← Back to School Portal
      </Link>
    </div>
  );
}
