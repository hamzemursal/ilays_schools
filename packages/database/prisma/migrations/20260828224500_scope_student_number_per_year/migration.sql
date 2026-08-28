-- Rescope student number uniqueness from per-school to per-school-per-year.
-- A promoted student keeps the same studentNumber across academic years by
-- design; under the old school-wide scope that would collide with their own
-- closed prior-year enrollment row.
DROP INDEX "student_enrollments_schoolId_studentNumber_key";

CREATE UNIQUE INDEX "student_enrollments_schoolId_academicYearId_studentNumbe_key" ON "student_enrollments"("schoolId", "academicYearId", "studentNumber");
