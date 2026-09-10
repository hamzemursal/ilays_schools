import { api } from "@/lib/api";

export const leaveRequestsApi = {
  list: api.listLeaveRequests,
  create: api.createLeaveRequest,
  approve: api.approveLeaveRequest,
  reject: api.rejectLeaveRequest,
};

export const staffAttendanceApi = {
  list: api.listStaffAttendance,
  mark: api.markStaffAttendance,
};
