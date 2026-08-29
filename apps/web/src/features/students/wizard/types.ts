import type { GuardianRelationship, Sex } from "@/lib/api";

export interface WizardGuardian {
  key: string;
  mode: "existing" | "new";
  guardianId?: string;
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  relationship: GuardianRelationship;
  isPrimaryContact: boolean;
}

export interface WizardState {
  photoFile: File | null;
  photoPreviewUrl: string | null;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  sex: Sex;
  guardians: WizardGuardian[];
  academicYearId: string;
  classId: string;
  sectionId: string;
}

export function emptyWizardState(): WizardState {
  return {
    photoFile: null,
    photoPreviewUrl: null,
    firstName: "",
    lastName: "",
    dateOfBirth: "",
    sex: "MALE",
    guardians: [],
    academicYearId: "",
    classId: "",
    sectionId: "",
  };
}

export const WIZARD_STEPS = ["Student", "Parent / Guardian", "Enrollment", "Subjects", "Review"] as const;
