import { Building2 } from "lucide-react";
import { PortalBrandHeader } from "@/features/auth/PortalBrandHeader";
import { LoginForm } from "@/features/auth/LoginForm";

// Deliberately not linked from /portal — this is where a School Admin (one
// school's own admin, distinct from /super-admin/login) signs in. Every
// admin permission is still enforced server-side regardless of how a
// visitor reaches this URL, but allowedRoles also stops any non-Admin
// account from ending up signed in here at all, rather than silently
// landing on its own dashboard.
export default function SchoolAdminLoginPage() {
  return (
    <div>
      <PortalBrandHeader subtitle="School Admin Sign In" icon={Building2} />
      <LoginForm
        identifierLabel="Email"
        identifierPlaceholder="you@school.com"
        redirectTo="/dashboard"
        allowedRoles={["SCHOOL_ADMIN"]}
        wrongRoleMessage="This account isn't a School Admin account."
      />
    </div>
  );
}
