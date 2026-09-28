import { redirect } from "next/navigation";

// Superseded by the school's Alumni Directory (/schools/:id/alumni). Kept as a
// redirect so old links and bookmarks still land somewhere useful.
export default async function LegacySchoolLifecycleAlumniPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/schools/${id}/alumni`);
}
