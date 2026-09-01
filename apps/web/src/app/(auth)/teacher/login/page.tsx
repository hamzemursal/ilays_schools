import { BookUser } from "lucide-react";
import { PortalBrandHeader } from "@/features/auth/PortalBrandHeader";
import { LoginForm } from "@/features/auth/LoginForm";

// Same reasoning as AdminLoginPage — not linked from /portal, but the real
// authorization (TeacherAssignment-scoped access) is unaffected either way.
export default function TeacherLoginPage() {
  return (
    <div>
      <PortalBrandHeader subtitle="Teacher Sign In" icon={BookUser} />
      <LoginForm identifierLabel="Email" identifierPlaceholder="you@school.com" redirectTo="/dashboard" />
    </div>
  );
}
