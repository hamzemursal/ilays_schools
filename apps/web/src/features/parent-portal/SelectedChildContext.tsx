"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { useAuth, ApiError } from "@/lib/auth-context";
import { api, type MyChild } from "@/lib/api";

interface SelectedChildContextValue {
  children: MyChild[];
  loading: boolean;
  error: string | null;
  selectedChildId: string | null;
  setSelectedChildId: (id: string) => void;
  selectedChild: MyChild | null;
}

const SelectedChildContext = createContext<SelectedChildContextValue | null>(null);

const STORAGE_KEY = "parent-portal:selected-child";

// Lives at the top of the whole app shell (not a nested /parent layout —
// Next's typed-routes codegen chokes on a layout nested two levels deep) and
// only ever fetches for accounts with the PARENT role; every other role sees
// an inert provider. Shared across every /parent/* page so switching the
// selected child in the header updates every page's data at once, and the
// choice survives a reload — never mixing data from different children
// incorrectly.
export function SelectedChildProvider({ children: reactChildren }: { children: React.ReactNode }) {
  const { user, accessToken } = useAuth();
  // null (not []) is the "haven't fetched yet" sentinel, so "loading" can be
  // derived instead of tracked as its own state that would need a synchronous
  // setState at the top of the effect below.
  const [childList, setChildList] = useState<MyChild[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedChildId, setSelectedChildIdState] = useState<string | null>(null);
  const isParent = user?.roles.includes("PARENT") ?? false;
  const loading = isParent && !!accessToken && childList === null;

  useEffect(() => {
    if (!accessToken || !isParent) return;
    api
      .listMyChildren(accessToken)
      .then((list) => {
        setChildList(list);
        setError(null);
        setSelectedChildIdState((prev) => {
          if (prev && list.some((c) => c.studentId === prev)) return prev;
          let stored: string | null = null;
          try {
            stored = window.localStorage.getItem(STORAGE_KEY);
          } catch {
            stored = null;
          }
          if (stored && list.some((c) => c.studentId === stored)) return stored;
          return list[0]?.studentId ?? null;
        });
      })
      .catch((err) => {
        setError(err instanceof ApiError ? err.message : "Failed to load your children");
        setChildList((prev) => prev ?? []);
      });
  }, [accessToken, isParent]);

  function setSelectedChildId(id: string) {
    setSelectedChildIdState(id);
    try {
      window.localStorage.setItem(STORAGE_KEY, id);
    } catch {
      // Private browsing / storage disabled — selection just won't persist.
    }
  }

  const children = childList ?? [];
  const selectedChild = children.find((c) => c.studentId === selectedChildId) ?? null;

  return (
    <SelectedChildContext.Provider
      value={{ children, loading, error, selectedChildId, setSelectedChildId, selectedChild }}
    >
      {reactChildren}
    </SelectedChildContext.Provider>
  );
}

export function useSelectedChild() {
  const ctx = useContext(SelectedChildContext);
  if (!ctx) throw new Error("useSelectedChild must be used within a SelectedChildProvider");
  return ctx;
}
