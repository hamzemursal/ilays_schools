-- CreateEnum
CREATE TYPE "SchoolType" AS ENUM ('PRIMARY', 'SECONDARY', 'PRIMARY_AND_SECONDARY');

-- CreateEnum
CREATE TYPE "SchoolStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "DivisionType" AS ENUM ('PRIMARY', 'SECONDARY');

-- CreateEnum
CREATE TYPE "Sex" AS ENUM ('MALE', 'FEMALE');

-- CreateEnum
CREATE TYPE "StudentStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'GRADUATED', 'TRANSFERRED', 'WITHDRAWN', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "EnrollmentStatus" AS ENUM ('ACTIVE', 'PROMOTED', 'TRANSFERRED_OUT', 'COMPLETED', 'GRADUATED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "GuardianRelationship" AS ENUM ('FATHER', 'MOTHER', 'GUARDIAN', 'OTHER');

-- CreateEnum
CREATE TYPE "TeacherStatus" AS ENUM ('ACTIVE', 'ON_LEAVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "TransferStatus" AS ENUM ('REQUESTED', 'APPROVED', 'REJECTED', 'EXECUTED');

-- CreateEnum
CREATE TYPE "PromotionBatchStatus" AS ENUM ('DRAFT', 'PREVIEWED', 'CONFIRMED', 'REVERTED');

-- CreateEnum
CREATE TYPE "PromotionOutcome" AS ENUM ('PROMOTED', 'RETAINED', 'COMPLETED', 'GRADUATED');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('PENDING_SETUP', 'ACTIVE', 'SUSPENDED');

-- CreateTable
CREATE TABLE "organizations" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "schools" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "SchoolType" NOT NULL,
    "status" "SchoolStatus" NOT NULL DEFAULT 'ACTIVE',
    "address" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "schools_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "academic_years" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "isCurrent" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "academic_years_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "divisions" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "type" "DivisionType" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "divisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "classes" (
    "id" TEXT NOT NULL,
    "divisionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "level" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "classes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sections" (
    "id" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "capacity" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subjects" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subjects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "class_subjects" (
    "classId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,

    CONSTRAINT "class_subjects_pkey" PRIMARY KEY ("classId","subjectId")
);

-- CreateTable
CREATE TABLE "students" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "dateOfBirth" TIMESTAMP(3) NOT NULL,
    "sex" "Sex" NOT NULL,
    "legacyStudentNumber" TEXT,
    "currentStatus" "StudentStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "students_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_enrollments" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "academicYearId" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "sectionId" TEXT NOT NULL,
    "studentNumber" TEXT NOT NULL,
    "rollNumber" INTEGER NOT NULL,
    "status" "EnrollmentStatus" NOT NULL DEFAULT 'ACTIVE',
    "startDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "student_enrollments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "guardians" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "guardians_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_guardians" (
    "studentId" TEXT NOT NULL,
    "guardianId" TEXT NOT NULL,
    "relationship" "GuardianRelationship" NOT NULL,
    "isPrimaryContact" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "student_guardians_pkey" PRIMARY KEY ("studentId","guardianId")
);

-- CreateTable
CREATE TABLE "teachers" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "schoolId" TEXT NOT NULL,
    "employeeNumber" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "phone" TEXT,
    "qualification" TEXT,
    "status" "TeacherStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "teachers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "teacher_assignments" (
    "id" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "academicYearId" TEXT NOT NULL,
    "sectionId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "teacher_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transfers" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "fromEnrollmentId" TEXT NOT NULL,
    "fromSchoolId" TEXT NOT NULL,
    "toSchoolId" TEXT NOT NULL,
    "toEnrollmentId" TEXT,
    "reason" TEXT,
    "status" "TransferStatus" NOT NULL DEFAULT 'REQUESTED',
    "requestedByUserId" TEXT NOT NULL,
    "approvedByUserId" TEXT,
    "transferDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "transfers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "promotion_batches" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "fromAcademicYearId" TEXT NOT NULL,
    "toAcademicYearId" TEXT NOT NULL,
    "initiatedByUserId" TEXT NOT NULL,
    "status" "PromotionBatchStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmedAt" TIMESTAMP(3),

    CONSTRAINT "promotion_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "promotion_items" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "fromEnrollmentId" TEXT NOT NULL,
    "toEnrollmentId" TEXT,
    "outcome" "PromotionOutcome" NOT NULL,
    "note" TEXT,

    CONSTRAINT "promotion_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT,
    "status" "UserStatus" NOT NULL DEFAULT 'PENDING_SETUP',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_schools" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_schools_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roles" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permissions" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,

    CONSTRAINT "permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_permissions" (
    "roleId" TEXT NOT NULL,
    "permissionId" TEXT NOT NULL,

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("roleId","permissionId")
);

-- CreateTable
CREATE TABLE "user_roles" (
    "userId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,

    CONSTRAINT "user_roles_pkey" PRIMARY KEY ("userId","roleId")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "revoked" BOOLEAN NOT NULL DEFAULT false,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT,
    "schoolId" TEXT,
    "actorUserId" TEXT,
    "action" TEXT NOT NULL,
    "resource" TEXT NOT NULL,
    "resourceId" TEXT,
    "before" JSONB,
    "after" JSONB,
    "ipAddress" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "schools_organizationId_name_key" ON "schools"("organizationId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "academic_years_schoolId_name_key" ON "academic_years"("schoolId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "divisions_schoolId_type_key" ON "divisions"("schoolId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "classes_divisionId_level_key" ON "classes"("divisionId", "level");

-- CreateIndex
CREATE UNIQUE INDEX "sections_classId_name_key" ON "sections"("classId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "subjects_schoolId_name_key" ON "subjects"("schoolId", "name");

-- CreateIndex
CREATE INDEX "students_organizationId_lastName_dateOfBirth_idx" ON "students"("organizationId", "lastName", "dateOfBirth");

-- CreateIndex
CREATE INDEX "student_enrollments_studentId_idx" ON "student_enrollments"("studentId");

-- CreateIndex
CREATE UNIQUE INDEX "student_enrollments_schoolId_academicYearId_classId_section_key" ON "student_enrollments"("schoolId", "academicYearId", "classId", "sectionId", "rollNumber");

-- CreateIndex
CREATE UNIQUE INDEX "student_enrollments_schoolId_studentNumber_key" ON "student_enrollments"("schoolId", "studentNumber");

-- CreateIndex
CREATE UNIQUE INDEX "guardians_userId_key" ON "guardians"("userId");

-- CreateIndex
CREATE INDEX "guardians_phone_idx" ON "guardians"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "teachers_userId_key" ON "teachers"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "teachers_schoolId_employeeNumber_key" ON "teachers"("schoolId", "employeeNumber");

-- CreateIndex
CREATE UNIQUE INDEX "teacher_assignments_teacherId_sectionId_subjectId_academicY_key" ON "teacher_assignments"("teacherId", "sectionId", "subjectId", "academicYearId");

-- CreateIndex
CREATE UNIQUE INDEX "transfers_fromEnrollmentId_key" ON "transfers"("fromEnrollmentId");

-- CreateIndex
CREATE UNIQUE INDEX "transfers_toEnrollmentId_key" ON "transfers"("toEnrollmentId");

-- CreateIndex
CREATE INDEX "transfers_fromSchoolId_idx" ON "transfers"("fromSchoolId");

-- CreateIndex
CREATE INDEX "transfers_toSchoolId_idx" ON "transfers"("toSchoolId");

-- CreateIndex
CREATE UNIQUE INDEX "promotion_items_fromEnrollmentId_key" ON "promotion_items"("fromEnrollmentId");

-- CreateIndex
CREATE UNIQUE INDEX "promotion_items_toEnrollmentId_key" ON "promotion_items"("toEnrollmentId");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "user_schools_userId_schoolId_key" ON "user_schools"("userId", "schoolId");

-- CreateIndex
CREATE UNIQUE INDEX "roles_name_key" ON "roles"("name");

-- CreateIndex
CREATE UNIQUE INDEX "permissions_key_key" ON "permissions"("key");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_tokenHash_key" ON "refresh_tokens"("tokenHash");

-- CreateIndex
CREATE INDEX "audit_logs_schoolId_createdAt_idx" ON "audit_logs"("schoolId", "createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_resource_resourceId_idx" ON "audit_logs"("resource", "resourceId");

-- AddForeignKey
ALTER TABLE "schools" ADD CONSTRAINT "schools_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "academic_years" ADD CONSTRAINT "academic_years_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "divisions" ADD CONSTRAINT "divisions_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "classes" ADD CONSTRAINT "classes_divisionId_fkey" FOREIGN KEY ("divisionId") REFERENCES "divisions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sections" ADD CONSTRAINT "sections_classId_fkey" FOREIGN KEY ("classId") REFERENCES "classes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subjects" ADD CONSTRAINT "subjects_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_subjects" ADD CONSTRAINT "class_subjects_classId_fkey" FOREIGN KEY ("classId") REFERENCES "classes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_subjects" ADD CONSTRAINT "class_subjects_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "subjects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "students" ADD CONSTRAINT "students_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_enrollments" ADD CONSTRAINT "student_enrollments_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_enrollments" ADD CONSTRAINT "student_enrollments_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_enrollments" ADD CONSTRAINT "student_enrollments_academicYearId_fkey" FOREIGN KEY ("academicYearId") REFERENCES "academic_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_enrollments" ADD CONSTRAINT "student_enrollments_classId_fkey" FOREIGN KEY ("classId") REFERENCES "classes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_enrollments" ADD CONSTRAINT "student_enrollments_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "sections"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guardians" ADD CONSTRAINT "guardians_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_guardians" ADD CONSTRAINT "student_guardians_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_guardians" ADD CONSTRAINT "student_guardians_guardianId_fkey" FOREIGN KEY ("guardianId") REFERENCES "guardians"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teachers" ADD CONSTRAINT "teachers_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teachers" ADD CONSTRAINT "teachers_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teacher_assignments" ADD CONSTRAINT "teacher_assignments_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "teachers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teacher_assignments" ADD CONSTRAINT "teacher_assignments_academicYearId_fkey" FOREIGN KEY ("academicYearId") REFERENCES "academic_years"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teacher_assignments" ADD CONSTRAINT "teacher_assignments_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "sections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teacher_assignments" ADD CONSTRAINT "teacher_assignments_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "subjects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transfers" ADD CONSTRAINT "transfers_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transfers" ADD CONSTRAINT "transfers_fromEnrollmentId_fkey" FOREIGN KEY ("fromEnrollmentId") REFERENCES "student_enrollments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transfers" ADD CONSTRAINT "transfers_toEnrollmentId_fkey" FOREIGN KEY ("toEnrollmentId") REFERENCES "student_enrollments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "promotion_items" ADD CONSTRAINT "promotion_items_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "promotion_batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "promotion_items" ADD CONSTRAINT "promotion_items_fromEnrollmentId_fkey" FOREIGN KEY ("fromEnrollmentId") REFERENCES "student_enrollments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "promotion_items" ADD CONSTRAINT "promotion_items_toEnrollmentId_fkey" FOREIGN KEY ("toEnrollmentId") REFERENCES "student_enrollments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_schools" ADD CONSTRAINT "user_schools_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_schools" ADD CONSTRAINT "user_schools_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
