import type { ExamType } from "@/lib/api";

export interface ExamWizardState {
  name: string;
  type: ExamType;
  academicYearId: string;
  startDate: string;
  endDate: string;
  description: string;
  selectedClassIds: Set<string>;
  selectedSubjectIds: Set<string>;
  maxMarks: string;
  passingMark: string;
  examDate: string;
  // False until the admin has deliberately edited Exam Date themselves —
  // while false, Exam Date auto-follows Start Date, so the two dates can't
  // silently drift apart the way they did before (Start Date corrected to
  // fix an academic-year mismatch, Exam Date left behind at the old value).
  examDateTouched: boolean;
}

export function emptyExamWizardState(defaultAcademicYearId: string): ExamWizardState {
  return {
    name: "",
    type: "MIDTERM",
    academicYearId: defaultAcademicYearId,
    startDate: "",
    endDate: "",
    description: "",
    selectedClassIds: new Set(),
    selectedSubjectIds: new Set(),
    maxMarks: "100",
    passingMark: "",
    examDate: "",
    examDateTouched: false,
  };
}

export const EXAM_WIZARD_STEPS = ["Basic Information", "Classes & Subjects", "Exam Settings", "Review & Create"] as const;
