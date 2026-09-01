import { ShieldCheck } from "lucide-react";
import { PortalBrandHeader } from "@/features/auth/PortalBrandHeader";
import { LoginForm } from "@/features/auth/LoginForm";

// Distinct from /admin/login (School Admin) purely so the two can never be
// mixed up before signing in — not linked from /portal, and not a security
// boundary either. /dashboard itself decides what an account actually sees
// (SuperAdminDashboard vs a per-school one) based on real permissions, the
// same as before this page existed.
export default function SuperAdminLoginPage() {
  return (
    <div>
      <PortalBrandHeader subtitle="Super Admin Sign In" icon={ShieldCheck} />
      <LoginForm identifierLabel="Email" identifierPlaceholder="you@school.com" redirectTo="/dashboard" />
    </div>
  );
}
