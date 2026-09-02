// One shared way to "share" a plain-text summary from any list page — the
// Web Share API when the browser/OS offers a real share sheet (mobile
// Chrome/Safari, and some desktop browsers), falling back to the clipboard
// everywhere else so the action never just silently does nothing.
export async function shareText(title: string, text: string): Promise<"shared" | "copied" | "failed"> {
  if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
    try {
      await navigator.share({ title, text });
      return "shared";
    } catch {
      // User cancelled, or the platform declined — fall through to clipboard
      // rather than treating a cancelled share sheet as a real failure.
    }
  }
  try {
    await navigator.clipboard.writeText(text);
    return "copied";
  } catch {
    return "failed";
  }
}

export interface ShareableStudent {
  firstName: string;
  lastName: string;
  studentNumber: string;
  rollNumber: number;
  className?: string;
  sectionName?: string;
}

// One consistent line format wherever a student list gets shared, so a
// pasted-into-WhatsApp roster always reads the same way regardless of which
// page it came from.
export function formatStudentListForShare(title: string, students: ShareableStudent[]): string {
  const lines = [title, `${students.length} student${students.length === 1 ? "" : "s"}`, ""];
  students.forEach((s, i) => {
    const place = [s.className, s.sectionName ? `Section ${s.sectionName}` : null].filter(Boolean).join(" - ");
    lines.push(
      `${i + 1}. ${s.firstName} ${s.lastName} — Roll ${s.rollNumber}, ID ${s.studentNumber}${place ? ` (${place})` : ""}`,
    );
  });
  return lines.join("\n");
}
