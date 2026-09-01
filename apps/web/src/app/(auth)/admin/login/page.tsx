import { Building2 } from "lucide-react";
import { PortalBrandHeader } from "@/features/auth/PortalBrandHeader";
import { LoginForm } from "@/features/auth/LoginForm";

// Deliberately not linked from /portal — this is where a School Admin (one
// school's own admin, distinct from /super-admin/login) signs in, not a
// page meant to be discovered publicly. Not the security boundary though:
// every admin permission is still enforced server-side regardless of how a
// visitor reaches this URL — /dashboard shows exactly what this account's
// real permissions allow, whichever URL got them there.
export default function SchoolAdminLoginPage() {
  return (
    <div>
      <PortalBrandHeader subtitle="School Admin Sign In" icon={Building2} />
      <LoginForm identifierLabel="Email" identifierPlaceholder="you@school.com" redirectTo="/dashboard" />
    </div>
  );
}
