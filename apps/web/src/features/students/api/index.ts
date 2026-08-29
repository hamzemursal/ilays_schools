import { api } from "@/lib/api";

// Thin, named slice of the shared API client scoped to the Students module —
// keeps feature code importing `studentsApi.x` instead of reaching into the
// global client directly, without duplicating any request logic.
export const studentsApi = {
  list: api.listStudents,
  create: api.createStudent,
  getOne: api.getStudent,
  addGuardian: api.addGuardian,
  uploadPhoto: api.uploadStudentPhoto,
  getPhotoUrl: api.getStudentPhotoUrl,
  listInvoices: api.listStudentInvoices,
  requestTransfer: api.requestTransfer,
};
