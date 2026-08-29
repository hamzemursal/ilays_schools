export interface WizardAssignment {
  academicYearId: string;
  classId: string;
  sectionId: string;
  subjectId: string;
}

export interface TeacherWizardState {
  firstName: string;
  lastName: string;
  qualification: string;
  phone: string;
  email: string;
  assignments: WizardAssignment[];
}

export function emptyTeacherWizardState(): TeacherWizardState {
  return {
    firstName: "",
    lastName: "",
    qualification: "",
    phone: "",
    email: "",
    assignments: [],
  };
}

export const TEACHER_WIZARD_STEPS = ["Personal", "Contact & Qualification", "Assignments", "Review"] as const;
