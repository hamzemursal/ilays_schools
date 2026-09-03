import { ShieldCheck } from "lucide-react";
import { PortalBrandHeader } from "@/features/auth/PortalBrandHeader";
import { LoginForm } from "@/features/auth/LoginForm";

// Distinct from /admin/login (School Admin) purely so the two can never be
// mixed up before signing in — not linked from /portal. allowedRoles makes
// this an actual boundary too: a non-admin account that happens to type its
// real password here is signed straight back out instead of landing on its
// own dashboard, so this URL never doubles as a working (if pointless)
// sign-in page for every other role in the system.
export default function SuperAdminLoginPage() {
  return (
    <div>
      <PortalBrandHeader subtitle="Super Admin Sign In" icon={ShieldCheck} />
      <LoginForm
        identifierLabel="Email"
        identifierPlaceholder="you@school.com"
        redirectTo="/dashboard"
        allowedRoles={["SUPER_ADMIN", "ORGANIZATION_ADMIN"]}
        wrongRoleMessage="This account isn't a Super Admin account."
      />
    </div>
  );
}
