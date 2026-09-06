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
  };
}

export const EXAM_WIZARD_STEPS = ["Basic Information", "Classes & Subjects", "Exam Settings", "Review & Create"] as const;
