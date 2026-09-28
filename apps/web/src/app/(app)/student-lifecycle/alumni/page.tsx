import { redirect } from "next/navigation";

// Superseded by the Alumni Directory (/alumni), which lists Form 4 graduates
// and, separately labelled, Class 8 completers. Kept as a redirect so old
// links and bookmarks still land somewhere useful.
export default function LegacyLifecycleAlumniPage() {
  redirect("/alumni");
}
