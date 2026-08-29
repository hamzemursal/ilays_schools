"use client";

import { useEffect, useState } from "react";
import { teachersApi } from "../api";
import { Avatar } from "@/components/ui/Avatar";

export function TeacherAvatar({
  accessToken,
  schoolId,
  teacherId,
  name,
  size = "sm",
}: {
  accessToken: string;
  schoolId: string;
  teacherId: string;
  name: string;
  size?: "sm" | "md" | "lg";
}) {
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    teachersApi
      .getPhotoUrl(accessToken, schoolId, teacherId)
      .then((res) => {
        if (!cancelled) setPhotoUrl(res.url);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [accessToken, schoolId, teacherId]);

  return <Avatar name={name} photoUrl={photoUrl} size={size} />;
}
