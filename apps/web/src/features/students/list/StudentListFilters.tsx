"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarCheck, DollarSign, GraduationCap, Search, User, Users, X } from "lucide-react";
import type { AcademicYear, AttendanceSession, ClassWithSections, FeeStatus, GuardianRelationship, School } from "@/lib/api";
import { FormField, Input, Select } from "@/components/ui/FormControls";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";

export type LevelFilter = "ALL" | "SECONDARY" | "PRIMARY";
export type AttendanceFilter = "ALL" | "EXCELLENT" | "GOOD" | "NEEDS_ATTENTION";
export type TriState = "" | "true" | "false";

export interface StudentListFilterState {
  yearId: string;
  levelFilter: LevelFilter;
  classId: string;
  sectionId: string;
  attendanceFilter: AttendanceFilter;
  search: string;
  gender: "" | "MALE" | "FEMALE";
  studentStatus: "" | "ACTIVE" | "COMPLETED" | "GRADUATED" | "TRANSFERRED" | "WITHDRAWN" | "ARCHIVED";
  hasParent: TriState;
  guardianName: string;
  guardianRelationship: "" | GuardianRelationship;
  hasGuardianContact: TriState;
  feeStatus: "" | FeeStatus;
  hasOutstandingBalance: TriState;
  attendanceTodayStatus: "" | "PRESENT" | "ABSENT" | "LATE" | "EXCUSED" | "NOT_RECORDED";
  attendanceTodaySession: "" | AttendanceSession;
}

export const EMPTY_SECONDARY_FILTERS = {
  gender: "" as const,
  studentStatus: "" as const,
  hasParent: "" as const,
  guardianName: "",
  guardianRelationship: "" as const,
  hasGuardianContact: "" as const,
  feeStatus: "" as const,
  hasOutstandingBalance: "" as const,
  attendanceTodayStatus: "" as const,
  attendanceTodaySession: "" as const,
};

const STUDENT_STATUS_LABEL: Record<string, string> = {
  ACTIVE: "Active",
  COMPLETED: "Completed",
  GRADUATED: "Graduated",
  TRANSFERRED: "Transferred",
  WITHDRAWN: "Withdrawn",
  ARCHIVED: "Archived",
};
const FEE_STATUS_LABEL: Record<string, string> = {
  PAID: "Paid",
  PARTIALLY_PAID: "Partially Paid",
  PENDING: "Pending",
  OVERDUE: "Overdue",
  NO_CHARGE: "No Charge",
};
const ATTENDANCE_TODAY_LABEL: Record<string, string> = {
  PRESENT: "Present",
  ABSENT: "Absent",
  LATE: "Late",
  EXCUSED: "Excused",
  NOT_RECORDED: "Not Recorded",
};
const RELATIONSHIP_LABEL: Record<string, string> = { FATHER: "Father", MOTHER: "Mother", GUARDIAN: "Guardian", OTHER: "Other" };

// The advanced-filter categories shown as a horizontal tab bar. Every field
// inside them maps to a real StudentDirectoryFilters param — nothing here is
// invented; a couple of fields the reference design groups by category
// (DOB/admission-date ranges, fee amount ranges) simply have no backing
// filter on the directory API, so they're left out rather than faked.
// "Academic Year" stays in the main row above the tabs since every other
// filter (and the Class/Section cascade) depends on it. Parent Name,
// Relationship and Has Contact all match against ANY of the student's
// active guardian links, not only the "primary" one shown in the
// Parent/Guardian column — the same scope the main Search box already uses
// for guardian name/phone, so a filter and a search term never disagree.
type CategoryId = "STUDENT" | "PARENTS" | "FEES" | "ATTENDANCE" | "ACADEMIC";

export function StudentListFilters({
  schoolId,
  schools,
  years,
  classes,
  hasAttendanceData,
  canViewFinance,
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
  // Finance filters/columns are opt-in exactly like the Fees & Payments tab
  // elsewhere in this app — a viewer without finance.ledger.view never sees
  // them offered here, matching what the backend would silently omit anyway.
  canViewFinance: boolean;
  state: StudentListFilterState;
  onChange: (patch: Partial<StudentListFilterState>) => void;
}) {
  const router = useRouter();
  const [activeCategory, setActiveCategory] = useState<CategoryId | null>(null);

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

  const categories: { id: CategoryId; label: string; icon: typeof User; count: number }[] = [
    { id: "STUDENT", label: "Student", icon: User, count: (state.studentStatus ? 1 : 0) + (state.gender ? 1 : 0) },
    {
      id: "PARENTS",
      label: "Parents & Guardians",
      icon: Users,
      count:
        (state.hasParent ? 1 : 0) + (state.guardianName.trim() ? 1 : 0) + (state.guardianRelationship ? 1 : 0) + (state.hasGuardianContact ? 1 : 0),
    },
    ...(canViewFinance
      ? [
          {
            id: "FEES" as const,
            label: "Fees & Payments",
            icon: DollarSign,
            count: (state.feeStatus ? 1 : 0) + (state.hasOutstandingBalance ? 1 : 0),
          },
        ]
      : []),
    {
      id: "ATTENDANCE",
      label: "Attendance",
      icon: CalendarCheck,
      count: (state.attendanceFilter !== "ALL" ? 1 : 0) + (state.attendanceTodayStatus ? 1 : 0) + (state.attendanceTodaySession ? 1 : 0),
    },
    // Class and Section live in the main filter row (they, together with
    // Academic Year, are what "controls" the list per the approved design) —
    // School Level is the only thing left for this tab, so it's only worth
    // showing when the school actually has more than one division to filter.
    ...(showLevelFilter
      ? [
          {
            id: "ACADEMIC" as const,
            label: "Academic",
            icon: GraduationCap,
            count: state.levelFilter !== "ALL" ? 1 : 0,
          },
        ]
      : []),
  ];

  function resetCategory(category: CategoryId) {
    if (category === "STUDENT") onChange({ studentStatus: "", gender: "" });
    if (category === "PARENTS") onChange({ hasParent: "", guardianName: "", guardianRelationship: "", hasGuardianContact: "" });
    if (category === "FEES") onChange({ feeStatus: "", hasOutstandingBalance: "" });
    if (category === "ATTENDANCE") onChange({ attendanceFilter: "ALL", attendanceTodayStatus: "", attendanceTodaySession: "" });
    if (category === "ACADEMIC") onLevelChange("ALL");
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
  if (state.gender) {
    chips.push({ key: "gender", label: state.gender === "MALE" ? "Male" : "Female", onRemove: () => onChange({ gender: "" }) });
  }
  if (state.studentStatus) {
    chips.push({ key: "status", label: STUDENT_STATUS_LABEL[state.studentStatus], onRemove: () => onChange({ studentStatus: "" }) });
  }
  if (state.hasParent) {
    chips.push({
      key: "hasParent",
      label: state.hasParent === "true" ? "Has Parent/Guardian" : "No Parent/Guardian on file",
      onRemove: () => onChange({ hasParent: "" }),
    });
  }
  if (state.guardianName.trim()) {
    chips.push({
      key: "guardianName",
      label: `Parent: "${state.guardianName.trim()}"`,
      onRemove: () => onChange({ guardianName: "" }),
    });
  }
  if (state.guardianRelationship) {
    chips.push({
      key: "guardianRelationship",
      label: `Relationship: ${RELATIONSHIP_LABEL[state.guardianRelationship]}`,
      onRemove: () => onChange({ guardianRelationship: "" }),
    });
  }
  if (state.hasGuardianContact) {
    chips.push({
      key: "hasGuardianContact",
      label: state.hasGuardianContact === "true" ? "Has Parent Contact" : "No Parent Contact on file",
      onRemove: () => onChange({ hasGuardianContact: "" }),
    });
  }
  if (state.feeStatus) {
    chips.push({ key: "feeStatus", label: `Fee: ${FEE_STATUS_LABEL[state.feeStatus]}`, onRemove: () => onChange({ feeStatus: "" }) });
  }
  if (state.hasOutstandingBalance) {
    chips.push({
      key: "outstanding",
      label: state.hasOutstandingBalance === "true" ? "Has outstanding balance" : "No outstanding balance",
      onRemove: () => onChange({ hasOutstandingBalance: "" }),
    });
  }
  if (state.attendanceTodaySession) {
    chips.push({
      key: "attendanceSession",
      label: `Session: ${state.attendanceTodaySession === "MORNING" ? "Morning" : "Afternoon"}`,
      onRemove: () => onChange({ attendanceTodaySession: "" }),
    });
  }
  if (state.attendanceTodayStatus) {
    chips.push({
      key: "attendanceToday",
      label: `Today: ${ATTENDANCE_TODAY_LABEL[state.attendanceTodayStatus]}`,
      onRemove: () => onChange({ attendanceTodayStatus: "" }),
    });
  }

  const hasSecondaryFilters =
    !!state.gender ||
    !!state.studentStatus ||
    !!state.hasParent ||
    !!state.guardianName.trim() ||
    !!state.guardianRelationship ||
    !!state.hasGuardianContact ||
    !!state.feeStatus ||
    !!state.hasOutstandingBalance ||
    !!state.attendanceTodayStatus ||
    !!state.attendanceTodaySession;
  const hasNonYearFilters =
    state.levelFilter !== "ALL" || !!state.classId || !!state.sectionId || state.attendanceFilter !== "ALL" || !!state.search.trim() || hasSecondaryFilters;

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
        <div className="relative min-w-[240px] flex-1">
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

      <div className="flex flex-wrap items-center gap-2">
        {categories.map((cat) => {
          const isOpen = activeCategory === cat.id;
          return (
            <button
              key={cat.id}
              type="button"
              aria-pressed={isOpen}
              onClick={() => setActiveCategory(isOpen ? null : cat.id)}
              className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors ${
                isOpen
                  ? "border-accent bg-accent-soft text-accent"
                  : "border-border bg-background text-foreground-soft hover:border-accent/40 hover:text-foreground"
              }`}
            >
              <cat.icon className="size-3.5" />
              {cat.label}
              {cat.count > 0 && (
                <span className="flex size-4 items-center justify-center rounded-full bg-accent text-[10px] font-semibold text-white">
                  {cat.count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {activeCategory && (
        <div className="rounded-xl border border-border bg-surface-soft p-4">
          {activeCategory === "STUDENT" && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField label="Student Status">
                <Select
                  value={state.studentStatus}
                  onChange={(e) => onChange({ studentStatus: e.target.value as StudentListFilterState["studentStatus"] })}
                >
                  <option value="">All Statuses</option>
                  {Object.entries(STUDENT_STATUS_LABEL).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </Select>
              </FormField>
              <FormField label="Gender">
                <Select value={state.gender} onChange={(e) => onChange({ gender: e.target.value as StudentListFilterState["gender"] })}>
                  <option value="">All</option>
                  <option value="MALE">Male</option>
                  <option value="FEMALE">Female</option>
                </Select>
              </FormField>
            </div>
          )}

          {activeCategory === "PARENTS" && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <FormField label="Has Parent/Guardian">
                <Select value={state.hasParent} onChange={(e) => onChange({ hasParent: e.target.value as TriState })}>
                  <option value="">Any</option>
                  <option value="true">Has parent/guardian on file</option>
                  <option value="false">No parent/guardian on file</option>
                </Select>
              </FormField>
              <FormField label="Parent/Guardian Name">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-foreground-muted" />
                  <Input
                    value={state.guardianName}
                    onChange={(e) => onChange({ guardianName: e.target.value })}
                    placeholder="Search by name…"
                    className="pl-9"
                  />
                </div>
              </FormField>
              <FormField label="Relationship">
                <Select
                  value={state.guardianRelationship}
                  onChange={(e) => onChange({ guardianRelationship: e.target.value as StudentListFilterState["guardianRelationship"] })}
                >
                  <option value="">Any</option>
                  {Object.entries(RELATIONSHIP_LABEL).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </Select>
              </FormField>
              <FormField label="Has Parent Contact">
                <Select value={state.hasGuardianContact} onChange={(e) => onChange({ hasGuardianContact: e.target.value as TriState })}>
                  <option value="">Any</option>
                  <option value="true">Has a phone number on file</option>
                  <option value="false">No phone number on file</option>
                </Select>
              </FormField>
            </div>
          )}

          {activeCategory === "FEES" && canViewFinance && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField label="Fee Status">
                <Select value={state.feeStatus} onChange={(e) => onChange({ feeStatus: e.target.value as StudentListFilterState["feeStatus"] })}>
                  <option value="">Any</option>
                  {Object.entries(FEE_STATUS_LABEL).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </Select>
              </FormField>
              <FormField label="Outstanding Balance">
                <Select
                  value={state.hasOutstandingBalance}
                  onChange={(e) => onChange({ hasOutstandingBalance: e.target.value as TriState })}
                >
                  <option value="">Any</option>
                  <option value="true">Has outstanding balance</option>
                  <option value="false">No outstanding balance</option>
                </Select>
              </FormField>
            </div>
          )}

          {activeCategory === "ATTENDANCE" && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              {hasAttendanceData && (
                <FormField label="Attendance % (this year)">
                  <Select
                    value={state.attendanceFilter}
                    onChange={(e) => onChange({ attendanceFilter: e.target.value as AttendanceFilter })}
                  >
                    <option value="ALL">All</option>
                    <option value="EXCELLENT">Excellent (90%+)</option>
                    <option value="GOOD">Good (75–89%)</option>
                    <option value="NEEDS_ATTENTION">Needs Attention (&lt;75%)</option>
                  </Select>
                </FormField>
              )}
              <FormField label="Attendance Session">
                <Select
                  value={state.attendanceTodaySession}
                  onChange={(e) => onChange({ attendanceTodaySession: e.target.value as StudentListFilterState["attendanceTodaySession"] })}
                >
                  <option value="">Any</option>
                  <option value="MORNING">Morning</option>
                  <option value="AFTERNOON">Afternoon</option>
                </Select>
              </FormField>
              <FormField label="Attendance Today">
                <Select
                  value={state.attendanceTodayStatus}
                  onChange={(e) => onChange({ attendanceTodayStatus: e.target.value as StudentListFilterState["attendanceTodayStatus"] })}
                >
                  <option value="">Any</option>
                  {Object.entries(ATTENDANCE_TODAY_LABEL).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </Select>
              </FormField>
              <p className="col-span-full text-xs text-foreground-muted">
                Attendance Session narrows which session the Attendance Today status checks (Morning, if none is chosen).
              </p>
            </div>
          )}

          {activeCategory === "ACADEMIC" && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <FormField label="School Level">
                <Select value={state.levelFilter} onChange={(e) => onLevelChange(e.target.value as LevelFilter)}>
                  <option value="ALL">All levels</option>
                  <option value="SECONDARY">Secondary</option>
                  <option value="PRIMARY">Primary</option>
                </Select>
              </FormField>
            </div>
          )}

          <div className="mt-3 flex justify-end">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => resetCategory(activeCategory)}
              disabled={categories.find((c) => c.id === activeCategory)?.count === 0}
            >
              Reset {categories.find((c) => c.id === activeCategory)?.label}
            </Button>
          </div>
        </div>
      )}

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
              onClick={() =>
                onChange({
                  levelFilter: "ALL",
                  classId: "",
                  sectionId: "",
                  attendanceFilter: "ALL",
                  search: "",
                  ...EMPTY_SECONDARY_FILTERS,
                })
              }
            >
              Clear All
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
