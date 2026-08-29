"use client";

import { useRef, useState } from "react";
import { Camera, Loader2 } from "lucide-react";
import { studentsApi } from "../api";
import { Avatar } from "@/components/ui/Avatar";
import { useToast } from "@/components/ui/Toast";
import { ApiError } from "@/lib/auth-context";

export function PhotoUpload({
  accessToken,
  studentId,
  name,
  canUpload,
  size = "md",
  photoUrl,
  onUploaded,
}: {
  accessToken: string;
  studentId: string;
  name: string;
  canUpload: boolean;
  size?: "sm" | "md" | "lg";
  photoUrl: string | null;
  onUploaded?: (url: string) => void;
}) {
  const { show } = useToast();
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setUploading(true);
    try {
      await studentsApi.uploadPhoto(accessToken, studentId, file);
      const res = await studentsApi.getPhotoUrl(accessToken, studentId);
      onUploaded?.(res.url);
      show("Photo uploaded.");
    } catch (err) {
      show(err instanceof ApiError ? err.message : "Upload failed", "danger");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="group relative inline-flex">
      <Avatar name={name} photoUrl={photoUrl} size={size} />
      {canUpload && (
        <>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
            className="absolute inset-0 flex items-center justify-center rounded-full bg-foreground/0 text-transparent transition-colors group-hover:bg-foreground/40 group-hover:text-white disabled:bg-foreground/40 disabled:text-white"
            aria-label={photoUrl ? "Replace photo" : "Upload photo"}
          >
            {uploading ? <Loader2 className="size-4 animate-spin" /> : <Camera className="size-4" />}
          </button>
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(e) => handleFile(e.target.files?.[0])}
          />
        </>
      )}
    </div>
  );
}
