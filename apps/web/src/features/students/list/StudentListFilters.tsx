"use client";

import { useRouter } from "next/navigation";
import { Search, X } from "lucide-react";
import type { AcademicYear, ClassWithSections, School } from "@/lib/api";
import { FormField, Input, Select } from "@/components/ui/FormControls";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";

export type LevelFilter = "ALL" | "SECONDARY" | "PRIMARY";
export type AttendanceFilter = "ALL" | "EXCELLENT" | "GOOD" | "NEEDS_ATTENTION";

export interface StudentListFilterState {
  yearId: string;
  levelFilter: LevelFilter;
  classId: string;
  sectionId: string;
  attendanceFilter: AttendanceFilter;
  search: string;
}

export function StudentListFilters({
  schoolId,
  schools,
  years,
  classes,
  hasAttendanceData,
  state,
  onChange,
}: {
  schoolId: string;
  // null: this actor has no schools.view permission, so no School selector
  // is shown at all — a School Admin can never switch which school's
  // students they're looking at, and the backend independently enforces
  // this regardless of what the frontend renders (see StudentsService).
  schools: School[] | null;
  years: AcademicYear[];
  classes: ClassWithSections[];
  hasAttendanceData: boolean;
  state: StudentListFilterState;
  onChange: (patch: Partial<StudentListFilterState>) => void;
}) {
  const router = useRouter();

  // Only offer a level a School actually has classes for — same reasoning
  // as the Classes & Sections page's own level filter.
  const hasSecondary = classes.some((c) => c.division.type === "SECONDARY");
  const hasPrimary = classes.some((c) => c.division.type === "PRIMARY");
  const showLevelFilter = hasSecondary && hasPrimary;

  const classesForLevel = classes.filter(
    (c) => state.levelFilter === "ALL" || c.division.type === state.levelFilter,
  );
  const selectedClass = classes.find((c) => c.id === state.classId);

  function onClassChange(classId: string) {
    onChange({ classId, sectionId: "" });
  }

  function onLevelChange(levelFilter: LevelFilter) {
    // A class from the previous level wouldn't belong to the newly chosen
    // one, so it (and whatever section was picked under it) gets cleared
    // rather than silently left pointing at a mismatched class.
    onChange({ levelFilter, classId: "", sectionId: "" });
  }

  const chips: { key: string; label: string; onRemove: () => void }[] = [];
  const yearName = years.find((y) => y.id === state.yearId)?.name;
  if (yearName) chips.push({ key: "year", label: yearName, onRemove: () => {} });
  if (state.levelFilter !== "ALL") {
    chips.push({
      key: "level",
      label: state.levelFilter === "SECONDARY" ? "Secondary" : "Primary",
      onRemove: () => onLevelChange("ALL"),
    });
  }
  if (selectedClass) {
    chips.push({ key: "class", label: selectedClass.name, onRemove: () => onClassChange("") });
  }
  const selectedSection = selectedClass?.sections.find((s) => s.id === state.sectionId);
  if (selectedSection) {
    chips.push({ key: "section", label: `Section ${selectedSection.name}`, onRemove: () => onChange({ sectionId: "" }) });
  }
  if (state.attendanceFilter !== "ALL") {
    const label =
      state.attendanceFilter === "EXCELLENT" ? "Excellent attendance" : state.attendanceFilter === "GOOD" ? "Good attendance" : "Needs attention";
    chips.push({ key: "attendance", label, onRemove: () => onChange({ attendanceFilter: "ALL" }) });
  }
  if (state.search.trim()) {
    chips.push({ key: "search", label: `"${state.search.trim()}"`, onRemove: () => onChange({ search: "" }) });
  }

  const hasNonYearFilters =
    state.levelFilter !== "ALL" || state.classId || state.sectionId || state.attendanceFilter !== "ALL" || state.search.trim();

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        {schools && (
          <FormField label="School" className="w-auto">
            <Select
              value={schoolId}
              onChange={(e) => router.push(`/schools/${e.target.value}/students`)}
              className="w-auto min-w-[160px]"
            >
              {schools.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </FormField>
        )}
        {years.length > 0 && (
          <FormField label="Academic Year" className="w-auto">
            <Select value={state.yearId} onChange={(e) => onChange({ yearId: e.target.value })} className="w-auto">
              {years.map((y) => (
                <option key={y.id} value={y.id}>
                  {y.name}
                  {y.isCurrent ? " (current)" : ""}
                </option>
              ))}
            </Select>
          </FormField>
        )}
        {showLevelFilter && (
          <FormField label="School Level" className="w-auto">
            <Select value={state.levelFilter} onChange={(e) => onLevelChange(e.target.value as LevelFilter)} className="w-auto">
              <option value="ALL">All levels</option>
              <option value="SECONDARY">Secondary</option>
              <option value="PRIMARY">Primary</option>
            </Select>
          </FormField>
        )}
        <FormField label="Class" className="w-auto">
          <Select value={state.classId} onChange={(e) => onClassChange(e.target.value)} className="w-auto min-w-[140px]">
            <option value="">All Classes</option>
            {classesForLevel.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField label="Section" className="w-auto">
          <Select
            value={state.sectionId}
            onChange={(e) => onChange({ sectionId: e.target.value })}
            disabled={!selectedClass}
            className="w-auto min-w-[130px]"
          >
            <option value="">All Sections</option>
            {selectedClass?.sections.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        </FormField>
        {hasAttendanceData && (
          <FormField label="Attendance" className="w-auto">
            <Select
              value={state.attendanceFilter}
              onChange={(e) => onChange({ attendanceFilter: e.target.value as AttendanceFilter })}
              className="w-auto min-w-[150px]"
            >
              <option value="ALL">All</option>
              <option value="EXCELLENT">Excellent (90%+)</option>
              <option value="GOOD">Good (75–89%)</option>
              <option value="NEEDS_ATTENTION">Needs Attention (&lt;75%)</option>
            </Select>
          </FormField>
        )}
        <div className="relative min-w-[220px] flex-1">
          <label className="mb-1 block text-xs font-medium text-foreground-soft">Search</label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-foreground-muted" />
            <Input
              value={state.search}
              onChange={(e) => onChange({ search: e.target.value })}
              placeholder="Search students, ID, roll no, or parent…"
              className="pl-9"
            />
          </div>
        </div>
      </div>

      {(chips.length > 0 || hasNonYearFilters) && (
        <div className="flex flex-wrap items-center gap-2">
          {chips.map((chip) => (
            <Badge key={chip.key} tone="accent" className="gap-1 pr-1.5">
              {chip.label}
              {chip.key !== "year" && (
                <button
                  type="button"
                  onClick={chip.onRemove}
                  aria-label={`Remove ${chip.label} filter`}
                  className="ml-0.5 rounded-full p-0.5 hover:bg-accent/20"
                >
                  <X className="size-3" />
                </button>
              )}
            </Badge>
          ))}
          {hasNonYearFilters && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => onChange({ levelFilter: "ALL", classId: "", sectionId: "", attendanceFilter: "ALL", search: "" })}
            >
              Clear All
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
