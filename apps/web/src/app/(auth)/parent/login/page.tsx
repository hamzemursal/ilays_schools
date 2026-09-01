import Link from "next/link";
import { Users } from "lucide-react";
import { PortalBrandHeader } from "@/features/auth/PortalBrandHeader";
import { LoginForm } from "@/features/auth/LoginForm";

export default function ParentLoginPage() {
  return (
    <div>
      <PortalBrandHeader subtitle="Parent Portal" icon={Users} />
      <LoginForm identifierLabel="Email" identifierPlaceholder="you@school.com" redirectTo="/parent" />
      <Link href="/portal" className="mt-4 block text-center text-sm text-foreground-muted hover:text-accent hover:underline">
        ← Back to School Portal
      </Link>
    </div>
  );
}
