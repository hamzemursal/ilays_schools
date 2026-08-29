import { api } from "@/lib/api";

// Thin, named slice of the shared API client scoped to the Teachers module.
// There is no getOne endpoint on the backend — a single teacher's detail is
// resolved client-side by filtering the school's teacher list.
export const teachersApi = {
  list: api.listTeachers,
  create: api.createTeacher,
  addAssignment: api.addTeacherAssignment,
  inviteLogin: api.inviteTeacherLogin,
  uploadPhoto: api.uploadTeacherPhoto,
  getPhotoUrl: api.getTeacherPhotoUrl,
};
