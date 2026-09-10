import { api } from "@/lib/api";

// Thin, named slice of the shared API client scoped to the Staff module.
// There is no getOne endpoint for departments — the school's whole list is
// small enough to filter client-side, same idiom as Teachers.
export const staffApi = {
  list: api.listStaff,
  getOne: api.getStaffMember,
  create: api.createStaffMember,
  update: api.updateStaffMember,
  remove: api.deleteStaffMember,
};

export const departmentsApi = {
  list: api.listDepartments,
  create: api.createDepartment,
  update: api.updateDepartment,
};
