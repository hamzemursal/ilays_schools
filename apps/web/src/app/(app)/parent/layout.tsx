"use client";

import { PortalLocaleProvider } from "@/lib/portal-locale";

// Everything under /parent is the Parent Portal — shown in Somali.
export default function ParentPortalLayout({ children }: { children: React.ReactNode }) {
  return <PortalLocaleProvider locale="so">{children}</PortalLocaleProvider>;
}
