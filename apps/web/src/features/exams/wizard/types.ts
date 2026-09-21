export interface ExamWizardState {
  name: string;
  academicYearId: string;
  // Which of the selected year's exactly two terms this exam counts toward
  // — required so every new exam contributes to a real Term/Annual result;
  // there is no "no term" or third-term option to pick.
  termId: string;
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
    academicYearId: defaultAcademicYearId,
    termId: "",
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
