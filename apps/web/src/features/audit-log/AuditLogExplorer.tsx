"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth, ApiError } from "@/lib/auth-context";
import { api, type AuditEvent, type AuditEventListResponse, type AuditLogFilters } from "@/lib/api";
import { PageHeader, type Crumb } from "@/components/ui/PageHeader";
import { Alert } from "@/components/ui/Alert";
import { useToast } from "@/components/ui/Toast";
import { AuditFilterBar } from "./AuditFilterBar";
import { AuditSummaryCards } from "./AuditSummaryCards";
import { AuditTable } from "./AuditTable";
import { AuditDetailDialog } from "./AuditDetailDialog";

// Shared by both the per-school Audit Log page (fixedSchoolId locked, no
// School column/filter) and the org-wide one (Super/Org Admin only — the
// School filter and column both appear, and the backend itself still scopes
// a School Admin to their own school(s) even if they somehow reach this
// view). Search is server-side and debounced; pagination/sorting are real
// backend operations, not a client-side slice of an already-fetched array —
// deliberately different from this app's usual DataTable convention, since
// audit history is the one dataset here that can genuinely grow unbounded.
export function AuditLogExplorer({
  fixedSchoolId,
  pageTitle,
  schoolName,
  breadcrumbs,
}: {
  fixedSchoolId?: string;
  pageTitle: string;
  schoolName?: string;
  breadcrumbs?: Crumb[];
}) {
  const { accessToken } = useAuth();
  const { show } = useToast();

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [filters, setFilters] = useState<AuditLogFilters>(fixedSchoolId ? { schoolId: fixedSchoolId } : {});
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [result, setResult] = useState<AuditEventListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<AuditEvent | null>(null);
  const [exporting, setExporting] = useState(false);
  const [schools, setSchools] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 350);
    return () => clearTimeout(t);
  }, [search]);

  // A new search/filter/page-size combination invalidates whatever page the
  // admin was on — reset during render (React's own recommended pattern for
  // "adjust state when a value changes") rather than an effect, matching
  // DataTable's own pagination-reset elsewhere in this app. The same render
  // pass also flips loading/error back to "fetching" so the effect below
  // never has to call setState synchronously in its body — only from inside
  // the async .then()/.catch() callbacks, once real data comes back.
  const filterKey = JSON.stringify({ ...filters, search: debouncedSearch, pageSize });
  const fetchKey = `${filterKey}:${page}`;
  const [prevFilterKey, setPrevFilterKey] = useState(filterKey);
  const [prevFetchKey, setPrevFetchKey] = useState(fetchKey);
  if (filterKey !== prevFilterKey) {
    setPrevFilterKey(filterKey);
    setPage(1);
  }
  if (fetchKey !== prevFetchKey) {
    setPrevFetchKey(fetchKey);
    setLoading(true);
    setError(null);
  }

  useEffect(() => {
    if (!accessToken) return;
    if (fixedSchoolId) return;
    api
      .listSchools(accessToken)
      .then((list) => setSchools(list.map((s) => ({ id: s.id, name: s.name }))))
      .catch(() => undefined);
  }, [accessToken, fixedSchoolId]);

  useEffect(() => {
    if (!accessToken) return;
    api
      .listAuditEvents(accessToken, { ...filters, search: debouncedSearch || undefined, page, pageSize })
      .then(setResult)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load audit log"))
      .finally(() => setLoading(false));
    // filterKey already captures every filter field plus search+pageSize;
    // `page` is the one dimension it deliberately excludes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken, filterKey, page]);

  const schoolNameById = useMemo(() => new Map(schools.map((s) => [s.id, s.name])), [schools]);

  async function handleExport() {
    if (!accessToken) return;
    setExporting(true);
    try {
      await api.exportAuditEvents(accessToken, { ...filters, search: debouncedSearch || undefined });
      show("Export downloaded.");
    } catch (err) {
      show(err instanceof ApiError ? err.message : "Failed to export audit log", "danger");
    } finally {
      setExporting(false);
    }
  }

  function handleReset() {
    setSearch("");
    setFilters(fixedSchoolId ? { schoolId: fixedSchoolId } : {});
  }

  const selectedSchoolName = fixedSchoolId
    ? schoolName
    : selected?.schoolId
      ? schoolNameById.get(selected.schoolId)
      : undefined;

  return (
    <div>
      <PageHeader
        eyebrow="Audit Log"
        title={pageTitle}
        description="System activity and security history"
        breadcrumbs={breadcrumbs}
      />

      <div className="space-y-5 p-4 sm:p-6">
        <AuditFilterBar
          search={search}
          onSearchChange={setSearch}
          filters={filters}
          onFilterChange={(patch) => setFilters((prev) => ({ ...prev, ...patch }))}
          onReset={handleReset}
          onExport={handleExport}
          exporting={exporting}
          schools={fixedSchoolId ? undefined : schools}
        />

        <AuditSummaryCards summary={result?.summary ?? null} />

        {error ? (
          <Alert tone="danger">{error}</Alert>
        ) : (
          <AuditTable
            rows={loading ? null : (result?.data ?? [])}
            pagination={result?.pagination ?? null}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
            onRowClick={setSelected}
            showSchoolColumn={!fixedSchoolId}
            schoolNameById={schoolNameById}
          />
        )}
      </div>

      <AuditDetailDialog event={selected} onClose={() => setSelected(null)} schoolName={selectedSchoolName} />
    </div>
  );
}
