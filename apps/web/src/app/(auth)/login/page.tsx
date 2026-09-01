import { redirect } from "next/navigation";

// /login is kept only as a legacy alias — the real entry points are /portal
// (public) and /student/login, /parent/login, /admin/login, /teacher/login.
export default function LegacyLoginRedirect() {
  redirect("/portal");
}
