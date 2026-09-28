"use client";

import { use } from "react";
import { AlumniProfile } from "@/features/alumni/AlumniProfile";

// The header (title, eyebrow, breadcrumb) lives in AlumniProfile: it follows
// the person's type — "Alumni Profile" only for Form 4 graduates, "Primary
// Completer Profile" for Class 8 completers.
export default function AlumniProfilePage({ params }: { params: Promise<{ id: string; studentId: string }> }) {
  const { id: schoolId, studentId } = use(params);
  return <AlumniProfile schoolId={schoolId} studentId={studentId} />;
}
