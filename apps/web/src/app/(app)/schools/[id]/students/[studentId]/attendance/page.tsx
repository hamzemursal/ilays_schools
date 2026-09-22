"use client";

import { use, useEffect, useState } from "react";
import { useAuth, ApiError } from "@/lib/auth-context";
import { api, type StudentAttendanceHistoryRecord, type StudentDetail } from "@/lib/api";
import { studentsApi } from "@/features/students/api";
import { PageHeader } from "@/components/ui/PageHeader";
import { Alert } from "@/components/ui/Alert";
import { SkeletonCards } from "@/components/ui/Skeleton";
import { StudentAttendanceHistory } from "@/features/students/student-details/StudentAttendanceHistory";

export default function StudentAttendanceHistoryPage({
  params,
}: {
  params: Promise<{ id: string; studentId: string }>;
}) {
  const { id: schoolId, studentId } = use(params);
  const { accessToken } = useAuth();

  const [student, setStudent] = useState<StudentDetail | null>(null);
  const [records, setRecords] = useState<StudentAttendanceHistoryRecord[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken) return;
    Promise.all([studentsApi.getOne(accessToken, studentId), api.getStudentAttendanceHistory(accessToken, studentId)])
      .then(([s, r]) => {
        setStudent(s);
        setRecords(r);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load attendance"));
  }, [accessToken, studentId]);

  const studentName = student ? `${student.firstName} ${student.lastName}` : "Student";

  return (
    <div>
      <PageHeader
        eyebrow="Students"
        title={`${studentName} — Attendance`}
        breadcrumbs={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Students", href: `/schools/${schoolId}/students` },
          { label: studentName, href: `/schools/${schoolId}/students/${studentId}` },
          { label: "Attendance" },
        ]}
      />
      <div className="space-y-5 p-4 sm:p-6">
        {error ? (
          <Alert tone="danger">{error}</Alert>
        ) : !records ? (
          <SkeletonCards count={3} />
        ) : (
          <StudentAttendanceHistory records={records} />
        )}
      </div>
    </div>
  );
}
