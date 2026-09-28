"use client";

import { use } from "react";
import { AlumniDirectory } from "@/features/alumni/AlumniDirectory";

export default function SchoolAlumniDirectoryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: schoolId } = use(params);
  return <AlumniDirectory fixedSchoolId={schoolId} breadcrumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "Alumni" }]} />;
}
