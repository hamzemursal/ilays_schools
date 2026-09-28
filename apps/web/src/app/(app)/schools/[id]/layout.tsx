"use client";

import { use, useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ApiError, useAuth } from "@/lib/auth-context";
import { api } from "@/lib/api";
import { Alert } from "@/components/ui/Alert";
import { SkeletonCards } from "@/components/ui/Skeleton";
import { isEntityId } from "@/lib/slug";

// Every page under /schools/[id] treats the segment as the school's real id
// (and the sidebar builds its links from it). Some links — e.g. the Class /
// Section workspaces — use the readable slug ("syl-schools") instead; left
// as-is, every page and sidebar link then sent "syl-schools" to the API as an
// id and failed with "School not found". So a slug is resolved ONCE here, with
// the same authorization as every other school lookup, and the URL is
// replaced by the real id — the rest of the path and the query are kept.
export default function SchoolSegmentLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { accessToken } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const needsResolve = !isEntityId(id);

  useEffect(() => {
    if (!needsResolve || !accessToken) return;
    let cancelled = false;
    api
      .resolveSchool(accessToken, decodeURIComponent(id))
      .then((school) => {
        if (cancelled) return;
        const rest = pathname.slice(`/schools/${id}`.length);
        const query = searchParams.toString();
        router.replace(`/schools/${school.id}${rest}${query ? `?${query}` : ""}`);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof ApiError ? err.message : "School not found");
      });
    return () => {
      cancelled = true;
    };
  }, [needsResolve, accessToken, id, pathname, searchParams, router]);

  if (!needsResolve) return <>{children}</>;
  if (error) {
    return (
      <div className="p-4 sm:p-6">
        <Alert tone="danger">{error}</Alert>
      </div>
    );
  }
  return (
    <div className="p-4 sm:p-6">
      <SkeletonCards count={3} />
    </div>
  );
}
