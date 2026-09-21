// Must stay in sync with the E2E_* exports in
// packages/database/prisma/seed.ts — duplicated rather than shared through
// a new workspace package for a handful of constants.
export const ADMIN = { email: "admin@saamalay.test", password: "SuperSecret123!" };
export const SUPER_ADMIN = { email: "super@ilays.test", password: "SuperSecret123!" };
export const TEACHER = { email: "teacher@saamalay.test", password: "TeacherPass123!" };
export const PARENT = { email: "amina.ali@example.test", password: "ParentPass123!" };

// A second organization with a SECONDARY school (Student Portal fixtures) -
// see seedSecondaryQaFixtures in packages/database/prisma/seed.ts.
export const SECONDARY_ADMIN = { email: "admin@secondary.test", password: "SuperSecret123!" };
export const SECONDARY_TEACHER = { email: "teacher@secondary.test", password: "TeacherPass123!" };
export const SECONDARY_PARENT = { email: "fadumo.warsame@example.test", password: "ParentPass123!" }; // mother of Ayaan Warsame
export const SECONDARY_OTHER_PARENT = { email: "hassan.noor@example.test", password: "ParentPass123!" }; // father of Bilan Noor
export const SECONDARY_STUDENT_NUMBERS = { Ayaan: "STU-2027-90001", Bilan: "STU-2027-90002", Cali: "STU-2027-90003" };
