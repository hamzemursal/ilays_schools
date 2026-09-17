"use client";

import { useRef, useState } from "react";
import { Camera, GraduationCap, Loader2, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/components/ui/Toast";

// A circular logo with an edit affordance overlaid — only rendered as
// editable for a user with settings.manage (currently School Admin, Super
// Admin, Organization Admin; see seed.ts) who is looking at their own
// school, never a Super Admin browsing someone else's. Change and remove
// both re-fetch the profile via onChanged so every open tab's sidebar
// reflects the new logo without a full reload.
export function SchoolBrandingEditor({
  accessToken,
  schoolId,
  logoUrl,
  editable,
  onChanged,
}: {
  accessToken: string;
  schoolId: string;
  logoUrl: string | null;
  editable: boolean;
  onChanged: () => Promise<void>;
}) {
  const { show } = useToast();
  const [menuOpen, setMenuOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setMenuOpen(false);
    setBusy(true);
    try {
      await api.uploadSchoolLogo(accessToken, schoolId, file);
      await onChanged();
      show("School logo updated.");
    } catch (err) {
      show(err instanceof Error ? err.message : "Couldn't upload the logo.", "danger");
    } finally {
      setBusy(false);
    }
  }

  async function handleRemove() {
    setMenuOpen(false);
    setBusy(true);
    try {
      await api.removeSchoolLogo(accessToken, schoolId);
      await onChanged();
      show("School logo removed.");
    } catch (err) {
      show(err instanceof Error ? err.message : "Couldn't remove the logo.", "danger");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="relative shrink-0">
      <div className="flex size-9 items-center justify-center overflow-hidden rounded-full bg-accent text-white">
        {busy ? (
          <Loader2 className="size-4 animate-spin" />
        ) : logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- Cloudinary URL, not a local/static asset
          <img src={logoUrl} alt="" className="size-full object-cover" />
        ) : (
          <GraduationCap className="size-4.5" />
        )}
      </div>

      {editable && !busy && (
        <>
          <button
            onClick={() => setMenuOpen((v) => !v)}
            aria-label="Edit school logo"
            className="absolute -right-1 -bottom-1 flex size-4.5 items-center justify-center rounded-full border-2 border-sidebar-bg bg-accent text-white hover:bg-accent-hover"
          >
            <Camera className="size-2.5" />
          </button>

          {menuOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
              <div className="absolute left-0 z-50 mt-2 w-44 rounded-xl border border-border bg-background p-1 shadow-lg">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-foreground-soft hover:bg-surface-hover hover:text-foreground"
                >
                  <Camera className="size-4" />
                  {logoUrl ? "Change logo" : "Upload logo"}
                </button>
                {logoUrl && (
                  <button
                    onClick={handleRemove}
                    className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-danger hover:bg-danger-soft"
                  >
                    <Trash2 className="size-4" />
                    Remove logo
                  </button>
                )}
              </div>
            </>
          )}
        </>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={handleFile}
      />
    </div>
  );
}
