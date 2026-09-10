// Must stay in sync with the E2E_* exports in
// packages/database/prisma/seed.ts — duplicated rather than shared through
// a new workspace package for a handful of constants.
export const ADMIN = { email: "admin@saamalay.test", password: "SuperSecret123!" };
export const SUPER_ADMIN = { email: "super@ilays.test", password: "SuperSecret123!" };
export const TEACHER = { email: "teacher@saamalay.test", password: "TeacherPass123!" };
export const PARENT = { email: "amina.ali@example.test", password: "ParentPass123!" };
