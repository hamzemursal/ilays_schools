-- Give TeacherAssignment.schoolId a real, FK-enforced relation to School.
-- It was previously a plain denormalized string column with no foreign key
-- and no index — every existing row is already written by
-- TeachersService.create/addAssignment, both of which validate schoolId
-- against a real school (see assertAssignmentBelongsToSchool) before
-- insert, and by the seed script (schoolId: school.id), so this constraint
-- is expected to apply cleanly against any existing data.

-- CreateIndex
CREATE INDEX "teacher_assignments_teacherId_schoolId_idx" ON "teacher_assignments"("teacherId", "schoolId");

-- AddForeignKey
ALTER TABLE "teacher_assignments" ADD CONSTRAINT "teacher_assignments_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;
