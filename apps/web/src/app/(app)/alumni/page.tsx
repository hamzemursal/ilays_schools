"use client";

import { AlumniDirectory } from "@/features/alumni/AlumniDirectory";

// Organization-wide Alumni Directory (Super/Org Admin). A School Admin is
// scoped to their own school(s) server-side.
export default function AlumniDirectoryPage() {
  return <AlumniDirectory breadcrumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "Alumni" }]} />;
}
