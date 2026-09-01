import type { Metadata } from "next";
import { AppShell } from "@/components/layout/AppShell";

// Every page in this group is a private, authenticated portal (Student,
// Parent, School Admin, Teacher, Super Admin) — noindex keeps it out of
// search results. This is a courtesy for accidental crawling, never the
// actual protection: real privacy comes from AppShell's redirect plus the
// server-side authorization on every API call, both unaffected by this.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function AppGroupLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
