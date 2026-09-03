import { BookUser } from "lucide-react";
import { PortalBrandHeader } from "@/features/auth/PortalBrandHeader";
import { LoginForm } from "@/features/auth/LoginForm";

// Same reasoning as AdminLoginPage — not linked from /portal. allowedRoles
// stops a non-Teacher account from ending up signed in here at all.
export default function TeacherLoginPage() {
  return (
    <div>
      <PortalBrandHeader subtitle="Teacher Sign In" icon={BookUser} />
      <LoginForm
        identifierLabel="Email"
        identifierPlaceholder="you@school.com"
        redirectTo="/dashboard"
        allowedRoles={["TEACHER"]}
        wrongRoleMessage="This account isn't a Teacher account."
      />
    </div>
  );
}
