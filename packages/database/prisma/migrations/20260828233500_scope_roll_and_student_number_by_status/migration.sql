-- Include `status` in both composite unique constraints so a closed
-- enrollment (PROMOTED / TRANSFERRED_OUT / COMPLETED / GRADUATED / WITHDRAWN)
-- never permanently reserves its roll number or student number within the
-- same school/year/section -- a new ACTIVE row can reuse it, while two
-- ACTIVE rows still can't collide.
DROP INDEX "student_enrollments_schoolId_academicYearId_classId_section_key";
DROP INDEX "student_enrollments_schoolId_academicYearId_studentNumber_key";

CREATE UNIQUE INDEX "student_enrollments_schoolId_academicYearId_classId_sect_key" ON "student_enrollments"("schoolId", "academicYearId", "classId", "sectionId", "rollNumber", "status");
CREATE UNIQUE INDEX "student_enrollments_schoolId_academicYearId_studentNum_key" ON "student_enrollments"("schoolId", "academicYearId", "studentNumber", "status");
