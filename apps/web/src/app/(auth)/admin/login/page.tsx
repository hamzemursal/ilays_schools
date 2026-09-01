import { ShieldCheck } from "lucide-react";
import { PortalBrandHeader } from "@/features/auth/PortalBrandHeader";
import { LoginForm } from "@/features/auth/LoginForm";

// Deliberately not linked from /portal — this is where Admin/Staff sign in,
// not a page meant to be discovered publicly. Not the security boundary
// though: schools.manage and every other admin permission are still
// enforced server-side regardless of how a visitor reaches this URL.
export default function AdminLoginPage() {
  return (
    <div>
      <PortalBrandHeader subtitle="Admin / Staff Sign In" icon={ShieldCheck} />
      <LoginForm identifierLabel="Email" identifierPlaceholder="you@school.com" redirectTo="/dashboard" />
    </div>
  );
}
