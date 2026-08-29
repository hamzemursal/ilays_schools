"use client";

import { useEffect, useState } from "react";
import { studentsApi } from "../api";
import { Avatar } from "@/components/ui/Avatar";

export function StudentAvatar({
  accessToken,
  studentId,
  name,
  size = "sm",
}: {
  accessToken: string;
  studentId: string;
  name: string;
  size?: "sm" | "md" | "lg";
}) {
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    studentsApi
      .getPhotoUrl(accessToken, studentId)
      .then((res) => {
        if (!cancelled) setPhotoUrl(res.url);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [accessToken, studentId]);

  return <Avatar name={name} photoUrl={photoUrl} size={size} />;
}
