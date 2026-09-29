"use client";

import { createContext, useContext } from "react";
import type { Profile } from "@/lib/api";

// The Parent Portal is shown in Somali; every other portal stays in English.
// Shared components (e.g. PortalResults) read this to pick their labels, so
// the same component speaks Somali to a parent and English to a student.
export type PortalLocale = "en" | "so";

const PortalLocaleContext = createContext<PortalLocale>("en");

export function PortalLocaleProvider({ locale, children }: { locale: PortalLocale; children: React.ReactNode }) {
  return <PortalLocaleContext.Provider value={locale}>{children}</PortalLocaleContext.Provider>;
}

export function usePortalLocale(): PortalLocale {
  return useContext(PortalLocaleContext);
}

// An account whose only role is PARENT — its whole shell (menu, header,
// child selector) is shown in Somali.
export function isParentOnly(user: Pick<Profile, "roles"> | null | undefined): boolean {
  return !!user && user.roles.length > 0 && user.roles.every((r) => r === "PARENT");
}
