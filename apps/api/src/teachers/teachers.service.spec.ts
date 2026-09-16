import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from "@nestjs/common";
import { Prisma } from "@school-erp/database";
import type { AuthenticatedUser } from "../auth/types/authenticated-user";
import { TeachersService } from "./teachers.service";
import { PrismaService } from "../prisma/prisma.service";
import { SchoolsService } from "../schools/schools.service";
import { GuardiansService } from "../guardians/guardians.service";
import { DocumentsService } from "../documents/documents.service";
import { StorageService } from "../storage/storage.service";
import { AuditService } from "../audit/audit.service";
import type { CreateTeacherDto } from "./dto/create-teacher.dto";
import type { CreateTeacherAssignmentInputDto } from "./dto/create-teacher-assignment-input.dto";
import type { UpdateTeacherDto } from "./dto/update-teacher.dto";

const ACTOR: AuthenticatedUser = {
  id: "admin-1",
  email: "admin@example.com",
  organizationId: "org-1",
  roles: ["SCHOOL_ADMIN"],
  permissions: ["teachers.manage"],
  schoolIds: ["school-1"],
};

function uniqueViolation() {
  return new Prisma.PrismaClientKnownRequestError("Unique constraint failed", { code: "P2002", clientVersion: "test" });
}

type MockPrisma = {
  teacher: {
    findFirst: jest.Mock;
    findMany: jest.Mock;
    update: jest.Mock;
    delete: jest.Mock;
    create: jest.Mock;
    count: jest.Mock;
    findUniqueOrThrow: jest.Mock;
  };
  teacherAssignment: { findMany: jest.Mock; findFirst: jest.Mock; create: jest.Mock; delete: jest.Mock };
  studentEnrollment: { findMany: jest.Mock };
  attendance: { groupBy: jest.Mock };
  mediaFile: { findMany: jest.Mock; deleteMany: jest.Mock };
  user: { delete: jest.Mock; findUnique: jest.Mock; upsert: jest.Mock };
  role: { findUniqueOrThrow: jest.Mock };
  userRole: { upsert: jest.Mock };
  userSchool: { upsert: jest.Mock };
  invitation: { create: jest.Mock; updateMany: jest.Mock };
  section: { findFirst: jest.Mock };
  subject: { findFirst: jest.Mock };
  academicYear: { findFirst: jest.Mock };
  $transaction: jest.Mock;
};

function createMockPrisma(): MockPrisma {
  const prisma: Partial<MockPrisma> = {
    teacher: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      create: jest.fn(),
      count: jest.fn(),
      findUniqueOrThrow: jest.fn(),
    },
    teacherAssignment: { findMany: jest.fn(), findFirst: jest.fn(), create: jest.fn(), delete: jest.fn() },
    studentEnrollment: { findMany: jest.fn() },
    attendance: { groupBy: jest.fn() },
    mediaFile: { findMany: jest.fn(), deleteMany: jest.fn() },
    user: { delete: jest.fn(), findUnique: jest.fn(), upsert: jest.fn() },
    role: { findUniqueOrThrow: jest.fn() },
    userRole: { upsert: jest.fn() },
    userSchool: { upsert: jest.fn() },
    invitation: { create: jest.fn(), updateMany: jest.fn() },
    section: { findFirst: jest.fn() },
    subject: { findFirst: jest.fn() },
    academicYear: { findFirst: jest.fn() },
  };
  prisma.$transaction = jest.fn((cb: (tx: unknown) => unknown) => cb(prisma));
  return prisma as MockPrisma;
}

function createService(prisma: MockPrisma) {
  const schools = { findOneAccessibleOrThrow: jest.fn().mockResolvedValue({ id: "school-1", organizationId: "org-1", name: "Ilays" }) };
  const guardians = { listForStudent: jest.fn().mockResolvedValue([]) };
  const documents = { tryGetPhotoUrl: jest.fn().mockResolvedValue(null) };
  const storage = { delete: jest.fn().mockResolvedValue(undefined) };
  const audit = { record: jest.fn().mockResolvedValue(undefined) };
  const service = new TeachersService(
    prisma as unknown as PrismaService,
    schools as unknown as SchoolsService,
    guardians as unknown as GuardiansService,
    documents as unknown as DocumentsService,
    storage as unknown as StorageService,
    audit as unknown as AuditService,
  );
  return { service, schools, guardians, documents, storage, audit };
}

describe("TeachersService.myAssignments / myProfile / updateMyProfile — self-service, no extra permission", () => {
  let prisma: MockPrisma;
  let service: TeachersService;

  beforeEach(() => {
    prisma = createMockPrisma();
    ({ service } = createService(prisma));
  });

  it("myAssignments returns an empty array, not an error, when the actor has no linked Teacher profile", async () => {
    prisma.teacher.findFirst.mockResolvedValue(null);
    const result = await service.myAssignments(ACTOR);
    expect(result).toEqual([]);
    expect(prisma.teacherAssignment.findMany).not.toHaveBeenCalled();
  });

  it("myAssignments scopes to the actor's own linked teacher, resolved by userId", async () => {
    prisma.teacher.findFirst.mockResolvedValue({ id: "teacher-1", userId: "admin-1" });
    prisma.teacherAssignment.findMany.mockResolvedValue([]);
    await service.myAssignments(ACTOR);
    expect(prisma.teacher.findFirst).toHaveBeenCalledWith({ where: { userId: "admin-1" } });
    expect(prisma.teacherAssignment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { teacherId: "teacher-1" } }),
    );
  });

  it("myProfile returns null (not a throw) when this account has no linked teacher", async () => {
    prisma.teacher.findFirst.mockResolvedValue(null);
    const result = await service.myProfile(ACTOR);
    expect(result).toBeNull();
  });

  it("updateMyProfile throws NotFoundException when this account has no linked teacher", async () => {
    prisma.teacher.findFirst.mockResolvedValue(null);
    await expect(service.updateMyProfile(ACTOR, { phone: "555" })).rejects.toThrow(NotFoundException);
  });

  it("updateMyProfile only touches personal/contact fields, resolved against the caller's own linked teacher id", async () => {
    prisma.teacher.findFirst.mockResolvedValue({ id: "teacher-1", userId: "admin-1" });
    prisma.teacher.update.mockResolvedValue({ id: "teacher-1" });

    await service.updateMyProfile(ACTOR, { phone: "555-1234", email: "t@example.com" });

    expect(prisma.teacher.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "teacher-1" }, data: expect.objectContaining({ phone: "555-1234", email: "t@example.com" }) }),
    );
  });
});

describe("TeachersService.myAssignmentStudents — authorization via the lookup itself", () => {
  let prisma: MockPrisma;
  let service: TeachersService;
  let guardians: { listForStudent: jest.Mock };
  let documents: { tryGetPhotoUrl: jest.Mock };

  beforeEach(() => {
    prisma = createMockPrisma();
    ({ service, guardians, documents } = createService(prisma));
  });

  it("throws ForbiddenException when the actor has no linked teacher profile at all", async () => {
    prisma.teacher.findFirst.mockResolvedValue(null);
    await expect(service.myAssignmentStudents(ACTOR, "assignment-1")).rejects.toThrow(ForbiddenException);
  });

  it("throws NotFoundException when the assignment isn't this teacher's own — never leaks another teacher's roster", async () => {
    prisma.teacher.findFirst.mockResolvedValue({ id: "teacher-1", userId: "admin-1" });
    prisma.teacherAssignment.findFirst.mockResolvedValue(null);

    await service.myAssignmentStudents(ACTOR, "assignment-1").catch(() => undefined);

    expect(prisma.teacherAssignment.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "assignment-1", teacherId: "teacher-1" } }),
    );
    await expect(service.myAssignmentStudents(ACTOR, "assignment-1")).rejects.toThrow(NotFoundException);
  });

  it("builds an attendanceSummary from the groupBy counts, per status bucket", async () => {
    prisma.teacher.findFirst.mockResolvedValue({ id: "teacher-1", userId: "admin-1" });
    prisma.teacherAssignment.findFirst.mockResolvedValue({ id: "assignment-1", sectionId: "sec-1", academicYearId: "year-1" });
    prisma.studentEnrollment.findMany.mockResolvedValue([
      { id: "enr-1", studentId: "student-1", studentNumber: "STU-1", rollNumber: 1, student: { firstName: "A", lastName: "One", sex: "MALE", dateOfBirth: new Date("2015-01-01"), currentStatus: "ACTIVE" } },
    ]);
    prisma.attendance.groupBy.mockResolvedValue([
      { status: "PRESENT", _count: 18 },
      { status: "ABSENT", _count: 2 },
    ]);

    const result = await service.myAssignmentStudents(ACTOR, "assignment-1");

    expect(result.students[0].attendanceSummary).toEqual({ present: 18, absent: 2, late: 0, excused: 0 });
  });

  it("scopes the enrollment lookup to the assignment's own section+academicYear+ACTIVE status", async () => {
    prisma.teacher.findFirst.mockResolvedValue({ id: "teacher-1", userId: "admin-1" });
    prisma.teacherAssignment.findFirst.mockResolvedValue({ id: "assignment-1", sectionId: "sec-1", academicYearId: "year-1" });
    prisma.studentEnrollment.findMany.mockResolvedValue([]);

    await service.myAssignmentStudents(ACTOR, "assignment-1");

    expect(prisma.studentEnrollment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { sectionId: "sec-1", academicYearId: "year-1", status: "ACTIVE" } }),
    );
  });

  it("fetches guardians and photo URL per student, and includes both in the response", async () => {
    prisma.teacher.findFirst.mockResolvedValue({ id: "teacher-1", userId: "admin-1" });
    prisma.teacherAssignment.findFirst.mockResolvedValue({ id: "assignment-1", sectionId: "sec-1", academicYearId: "year-1" });
    prisma.studentEnrollment.findMany.mockResolvedValue([
      { id: "enr-1", studentId: "student-1", studentNumber: "STU-1", rollNumber: 1, student: { firstName: "A", lastName: "One", sex: "MALE", dateOfBirth: new Date("2015-01-01"), currentStatus: "ACTIVE" } },
    ]);
    prisma.attendance.groupBy.mockResolvedValue([]);
    guardians.listForStudent.mockResolvedValue([{ id: "g1", firstName: "Parent" }]);
    documents.tryGetPhotoUrl.mockResolvedValue("https://cdn.example.com/photo.png");

    const result = await service.myAssignmentStudents(ACTOR, "assignment-1");

    expect(guardians.listForStudent).toHaveBeenCalledWith(ACTOR, "student-1");
    expect(documents.tryGetPhotoUrl).toHaveBeenCalledWith("STUDENT", "student-1");
    expect(result.students[0].guardians).toEqual([{ id: "g1", firstName: "Parent" }]);
    expect(result.students[0].photoUrl).toBe("https://cdn.example.com/photo.png");
  });
});

describe("TeachersService.listForSchool / getOne", () => {
  let prisma: MockPrisma;
  let service: TeachersService;

  beforeEach(() => {
    prisma = createMockPrisma();
    ({ service } = createService(prisma));
  });

  it("listForSchool checks school access, orders by lastName, and matches home school OR a cross-school assignment here", async () => {
    prisma.teacher.findMany.mockResolvedValue([]);
    const { service: svc, schools } = createService(prisma);
    await svc.listForSchool(ACTOR, "school-1");
    expect(schools.findOneAccessibleOrThrow).toHaveBeenCalledWith(ACTOR, "school-1");
    expect(prisma.teacher.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { OR: [{ schoolId: "school-1" }, { assignments: { some: { schoolId: "school-1" } } }] },
        orderBy: { lastName: "asc" },
      }),
    );
  });

  it("getOne throws NotFoundException for a teacher not in this school and not assigned here", async () => {
    prisma.teacher.findFirst.mockResolvedValue(null);
    await expect(service.getOne(ACTOR, "school-1", "teacher-1")).rejects.toThrow(NotFoundException);
  });

  it("getOne looks up by home school OR a cross-school assignment here — a teacher assigned here from another school isn't a 404", async () => {
    prisma.teacher.findFirst.mockResolvedValue({ id: "teacher-1", schoolId: "school-2", assignments: [] });
    await service.getOne(ACTOR, "school-1", "teacher-1");
    expect(prisma.teacher.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "teacher-1", OR: [{ schoolId: "school-1" }, { assignments: { some: { schoolId: "school-1" } } }] },
      }),
    );
  });
});

// This is the actual security boundary: `assignments` must never come back
// unscoped for an actor who isn't organization-wide, no matter what the
// frontend later chooses to render. A School Admin's `schoolIds` always has
// at least one entry (see accessibleWhere elsewhere in the app); a Super
// Admin / Organization Admin's is empty, which is the one signal this
// service trusts to widen the query at all.
describe("TeachersService — teacher-assignment visibility is scoped in the query, not just in the response", () => {
  let prisma: MockPrisma;
  let service: TeachersService;

  const SCHOOL_ADMIN: AuthenticatedUser = { ...ACTOR, schoolIds: ["school-1"] };
  const SUPER_ADMIN: AuthenticatedUser = { ...ACTOR, roles: ["SUPER_ADMIN"], schoolIds: [] };

  beforeEach(() => {
    prisma = createMockPrisma();
    ({ service } = createService(prisma));
    prisma.teacher.findMany.mockResolvedValue([]);
    prisma.teacher.findFirst.mockResolvedValue({ id: "teacher-1" });
    prisma.teacher.update.mockResolvedValue({ id: "teacher-1", firstName: "Amina", lastName: "Hassan" });
  });

  it("listForSchool filters assignments to this school for a School Admin", async () => {
    await service.listForSchool(SCHOOL_ADMIN, "school-1");
    expect(prisma.teacher.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        include: expect.objectContaining({ assignments: expect.objectContaining({ where: { schoolId: "school-1" } }) }),
      }),
    );
  });

  it("listForSchool does not filter assignments for a Super Admin — every school this teacher works at comes back", async () => {
    await service.listForSchool(SUPER_ADMIN, "school-1");
    expect(prisma.teacher.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        include: expect.objectContaining({ assignments: expect.objectContaining({ where: undefined }) }),
      }),
    );
  });

  it("getOne filters assignments to this school for a School Admin", async () => {
    await service.getOne(SCHOOL_ADMIN, "school-1", "teacher-1");
    expect(prisma.teacher.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        include: expect.objectContaining({ assignments: expect.objectContaining({ where: { schoolId: "school-1" } }) }),
      }),
    );
  });

  it("getOne does not filter assignments for a Super Admin", async () => {
    await service.getOne(SUPER_ADMIN, "school-1", "teacher-1");
    expect(prisma.teacher.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        include: expect.objectContaining({ assignments: expect.objectContaining({ where: undefined }) }),
      }),
    );
  });

  it("update's returned teacher has assignments filtered to this school for a School Admin", async () => {
    await service.update(SCHOOL_ADMIN, "school-1", "teacher-1", { firstName: "Amina" });
    expect(prisma.teacher.update).toHaveBeenCalledWith(
      expect.objectContaining({
        include: expect.objectContaining({ assignments: expect.objectContaining({ where: { schoolId: "school-1" } }) }),
      }),
    );
  });

  it("update's returned teacher is not assignment-filtered for a Super Admin", async () => {
    await service.update(SUPER_ADMIN, "school-1", "teacher-1", { firstName: "Amina" });
    expect(prisma.teacher.update).toHaveBeenCalledWith(
      expect.objectContaining({
        include: expect.objectContaining({ assignments: expect.objectContaining({ where: undefined }) }),
      }),
    );
  });
});

describe("TeachersService.update", () => {
  let prisma: MockPrisma;
  let service: TeachersService;
  let audit: { record: jest.Mock };

  beforeEach(() => {
    prisma = createMockPrisma();
    ({ service, audit } = createService(prisma));
  });

  function dto(overrides: Partial<UpdateTeacherDto> = {}): UpdateTeacherDto {
    return { firstName: "Amina", ...overrides };
  }

  it("throws NotFoundException for a teacher not in this school", async () => {
    prisma.teacher.findFirst.mockResolvedValue(null);
    await expect(service.update(ACTOR, "school-1", "teacher-1", dto())).rejects.toThrow(NotFoundException);
    expect(prisma.teacher.update).not.toHaveBeenCalled();
  });

  it("converts dateOfBirth/employmentDate strings to real Dates, leaving them undefined when omitted", async () => {
    prisma.teacher.findFirst.mockResolvedValue({ id: "teacher-1" });
    prisma.teacher.update.mockResolvedValue({ id: "teacher-1", firstName: "Amina", lastName: "Hassan" });

    await service.update(ACTOR, "school-1", "teacher-1", dto({ dateOfBirth: "1990-05-01" }));

    expect(prisma.teacher.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ dateOfBirth: new Date("1990-05-01"), employmentDate: undefined }) }),
    );
  });

  it("records a TEACHER_UPDATED audit entry with the resolved teacher's full name", async () => {
    prisma.teacher.findFirst.mockResolvedValue({ id: "teacher-1" });
    prisma.teacher.update.mockResolvedValue({ id: "teacher-1", firstName: "Amina", lastName: "Hassan" });

    await service.update(ACTOR, "school-1", "teacher-1", dto());

    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: "TEACHER_UPDATED", resourceId: "teacher-1", resourceName: "Amina Hassan" }),
    );
  });
});

describe("TeachersService.remove — cascade cleanup", () => {
  let prisma: MockPrisma;
  let service: TeachersService;
  let storage: { delete: jest.Mock };
  let audit: { record: jest.Mock };

  beforeEach(() => {
    prisma = createMockPrisma();
    ({ service, storage, audit } = createService(prisma));
    prisma.teacher.findFirst.mockResolvedValue({ id: "teacher-1", firstName: "Amina", lastName: "Hassan", employeeNumber: "EMP-00001", userId: null });
    prisma.mediaFile.findMany.mockResolvedValue([]);
  });

  it("throws NotFoundException for a teacher not in this school", async () => {
    prisma.teacher.findFirst.mockResolvedValue(null);
    await expect(service.remove(ACTOR, "school-1", "teacher-1")).rejects.toThrow(NotFoundException);
  });

  it("deletes the Teacher row and its MediaFile rows inside the transaction", async () => {
    await service.remove(ACTOR, "school-1", "teacher-1");
    expect(prisma.mediaFile.deleteMany).toHaveBeenCalledWith({ where: { ownerType: "TEACHER", ownerId: "teacher-1" } });
    expect(prisma.teacher.delete).toHaveBeenCalledWith({ where: { id: "teacher-1" } });
  });

  it("also deletes the linked login User when the teacher has one, but not when it doesn't", async () => {
    await service.remove(ACTOR, "school-1", "teacher-1");
    expect(prisma.user.delete).not.toHaveBeenCalled();

    prisma.teacher.findFirst.mockResolvedValue({ id: "teacher-1", firstName: "A", lastName: "B", employeeNumber: "EMP-1", userId: "user-1" });
    await service.remove(ACTOR, "school-1", "teacher-1");
    expect(prisma.user.delete).toHaveBeenCalledWith({ where: { id: "user-1" } });
  });

  it("best-effort deletes every MediaFile's storage object, never letting one failure abort the operation", async () => {
    prisma.mediaFile.findMany.mockResolvedValue([
      { storageKey: "teachers/teacher-1/a.png", mimeType: "image/png" },
      { storageKey: "teachers/teacher-1/b.pdf", mimeType: "application/pdf" },
    ]);
    storage.delete.mockRejectedValueOnce(new Error("cloudinary down")).mockResolvedValueOnce(undefined);

    await expect(service.remove(ACTOR, "school-1", "teacher-1")).resolves.toEqual({ success: true });
    expect(storage.delete).toHaveBeenCalledTimes(2);
  });

  it("records a WARNING-severity TEACHER_DELETED audit entry with the pre-delete snapshot", async () => {
    await service.remove(ACTOR, "school-1", "teacher-1");
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "TEACHER_DELETED",
        severity: "WARNING",
        before: { firstName: "Amina", lastName: "Hassan", employeeNumber: "EMP-00001" },
      }),
      prisma,
    );
  });
});

describe("TeachersService.create", () => {
  let prisma: MockPrisma;
  let service: TeachersService;

  beforeEach(() => {
    prisma = createMockPrisma();
    ({ service } = createService(prisma));
    prisma.section.findFirst.mockResolvedValue({ id: "sec-1" });
    prisma.subject.findFirst.mockResolvedValue({ id: "subj-1" });
    prisma.academicYear.findFirst.mockResolvedValue({ id: "year-1" });
    prisma.teacher.count.mockResolvedValue(5);
    prisma.teacher.create.mockResolvedValue({ id: "teacher-1", firstName: "Amina", lastName: "Hassan", employeeNumber: "EMP-00006" });
    prisma.teacher.findUniqueOrThrow.mockResolvedValue({ id: "teacher-1", assignments: [] });
  });

  function dto(overrides: Partial<CreateTeacherDto> = {}): CreateTeacherDto {
    return { firstName: "Amina", lastName: "Hassan", ...overrides };
  }

  it("auto-generates a padded sequential employeeNumber when none is given", async () => {
    await service.create(ACTOR, "school-1", dto());
    expect(prisma.teacher.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ employeeNumber: "EMP-00006" }) }),
    );
  });

  it("uses the given employeeNumber verbatim when provided", async () => {
    await service.create(ACTOR, "school-1", dto({ employeeNumber: "EMP-CUSTOM" }));
    expect(prisma.teacher.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ employeeNumber: "EMP-CUSTOM" }) }),
    );
  });

  it("generates a permanent, organization-wide teacherCode from a fresh org-wide count", async () => {
    await service.create(ACTOR, "school-1", dto());
    expect(prisma.teacher.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ teacherCode: "TCH-00006" }) }),
    );
  });

  it("retries with a fresh teacherCode when it collides under a concurrent create, without giving up on the first try", async () => {
    // count() is called three times total: once by generateEmployeeNumber
    // (school-scoped, value irrelevant here), then twice by
    // createWithSequentialCode's org-wide teacherCode generation/retry.
    prisma.teacher.count.mockResolvedValueOnce(0).mockResolvedValueOnce(5).mockResolvedValueOnce(6);
    prisma.teacher.create
      .mockRejectedValueOnce(
        new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
          code: "P2002",
          clientVersion: "test",
          meta: { target: ["teacherCode"] },
        }),
      )
      .mockResolvedValueOnce({ id: "teacher-1", firstName: "Amina", lastName: "Hassan", employeeNumber: "EMP-00006" });

    await service.create(ACTOR, "school-1", dto());

    expect(prisma.teacher.create).toHaveBeenNthCalledWith(1, expect.objectContaining({ data: expect.objectContaining({ teacherCode: "TCH-00006" }) }));
    expect(prisma.teacher.create).toHaveBeenNthCalledWith(2, expect.objectContaining({ data: expect.objectContaining({ teacherCode: "TCH-00007" }) }));
  });

  it("rejects the same subject assigned to the same class/section/year twice, before touching the database", async () => {
    const assignment: CreateTeacherAssignmentInputDto = { academicYearId: "year-1", sectionId: "sec-1", subjectId: "subj-1" };
    await expect(service.create(ACTOR, "school-1", dto({ assignments: [assignment, { ...assignment }] }))).rejects.toThrow(
      "The same subject can't be assigned to the same class/section twice",
    );
    expect(prisma.teacher.create).not.toHaveBeenCalled();
  });

  it("rejects a section that doesn't belong to this school", async () => {
    prisma.section.findFirst.mockResolvedValue(null);
    await expect(
      service.create(ACTOR, "school-1", dto({ assignments: [{ academicYearId: "year-1", sectionId: "sec-1", subjectId: "subj-1" }] })),
    ).rejects.toThrow("That section does not belong to this school");
  });

  it("rejects a subject that doesn't belong to this school", async () => {
    prisma.subject.findFirst.mockResolvedValue(null);
    await expect(
      service.create(ACTOR, "school-1", dto({ assignments: [{ academicYearId: "year-1", sectionId: "sec-1", subjectId: "subj-1" }] })),
    ).rejects.toThrow("That subject does not belong to this school");
  });

  it("rejects an academic year that doesn't belong to this school", async () => {
    prisma.academicYear.findFirst.mockResolvedValue(null);
    await expect(
      service.create(ACTOR, "school-1", dto({ assignments: [{ academicYearId: "year-1", sectionId: "sec-1", subjectId: "subj-1" }] })),
    ).rejects.toThrow("That academic year does not belong to this school");
  });

  it("creates one TeacherAssignment per requested assignment", async () => {
    await service.create(
      ACTOR,
      "school-1",
      dto({
        assignments: [
          { academicYearId: "year-1", sectionId: "sec-1", subjectId: "subj-1" },
          { academicYearId: "year-1", sectionId: "sec-1", subjectId: "subj-2" },
        ],
      }),
    );
    expect(prisma.teacherAssignment.create).toHaveBeenCalledTimes(2);
  });

  it("translates a P2002 violation (duplicate employee number) into a ConflictException", async () => {
    prisma.teacher.create.mockRejectedValue(uniqueViolation());
    await expect(service.create(ACTOR, "school-1", dto())).rejects.toThrow(ConflictException);
    await expect(service.create(ACTOR, "school-1", dto())).rejects.toThrow(
      "A teacher with this employee number already exists in this school",
    );
  });
});

describe("TeachersService.addAssignment / removeAssignment", () => {
  let prisma: MockPrisma;
  let service: TeachersService;

  beforeEach(() => {
    prisma = createMockPrisma();
    ({ service } = createService(prisma));
    prisma.section.findFirst.mockResolvedValue({ id: "sec-1" });
    prisma.subject.findFirst.mockResolvedValue({ id: "subj-1" });
    prisma.academicYear.findFirst.mockResolvedValue({ id: "year-1" });
  });

  function dto(): CreateTeacherAssignmentInputDto {
    return { academicYearId: "year-1", sectionId: "sec-1", subjectId: "subj-1" };
  }

  it("addAssignment throws NotFoundException for a teacher not in this organization", async () => {
    prisma.teacher.findFirst.mockResolvedValue(null);
    await expect(service.addAssignment(ACTOR, "school-1", "teacher-1", dto())).rejects.toThrow(NotFoundException);
    await expect(service.addAssignment(ACTOR, "school-1", "teacher-1", dto())).rejects.toThrow(
      "Teacher not found in your organization",
    );
  });

  // The multi-school feature itself: a teacher whose Teacher row's home
  // school is NOT "school-1" must still be assignable here, as long as
  // they're in the same organization — the lookup is by organizationId,
  // never by schoolId.
  it("addAssignment succeeds for a teacher whose home school differs from this one, same organization", async () => {
    prisma.teacher.findFirst.mockResolvedValue({ id: "teacher-1", schoolId: "some-other-school" });
    prisma.teacherAssignment.create.mockResolvedValue({ id: "assignment-1" });

    await service.addAssignment(ACTOR, "school-1", "teacher-1", dto());

    expect(prisma.teacher.findFirst).toHaveBeenCalledWith({
      where: { id: "teacher-1", school: { organizationId: "org-1" } },
    });
    expect(prisma.teacherAssignment.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ teacherId: "teacher-1", schoolId: "school-1" }) }),
    );
  });

  it("addAssignment translates a P2002 violation into a ConflictException with a specific message", async () => {
    prisma.teacher.findFirst.mockResolvedValue({ id: "teacher-1" });
    prisma.teacherAssignment.create.mockRejectedValue(uniqueViolation());
    await expect(service.addAssignment(ACTOR, "school-1", "teacher-1", dto())).rejects.toThrow(
      "This teacher is already assigned to that section/subject/year",
    );
  });

  it("removeAssignment throws NotFoundException for a teacher not in this organization", async () => {
    prisma.teacher.findFirst.mockResolvedValue(null);
    await expect(service.removeAssignment(ACTOR, "school-1", "teacher-1", "assignment-1")).rejects.toThrow(NotFoundException);
  });

  it("removeAssignment throws NotFoundException for an assignment not belonging to this teacher", async () => {
    prisma.teacher.findFirst.mockResolvedValue({ id: "teacher-1" });
    prisma.teacherAssignment.findFirst.mockResolvedValue(null);
    await expect(service.removeAssignment(ACTOR, "school-1", "teacher-1", "assignment-1")).rejects.toThrow(
      "Assignment not found for this teacher",
    );
  });

  // Now that the teacher lookup is org-wide rather than same-school, the
  // assignment lookup is what must stop this school's admin from deleting
  // an assignment that's actually at a DIFFERENT school this teacher
  // teaches at — asserted explicitly since the old same-school teacher
  // check used to make this redundant.
  it("removeAssignment throws NotFoundException when the assignment belongs to a different school", async () => {
    prisma.teacher.findFirst.mockResolvedValue({ id: "teacher-1" });
    prisma.teacherAssignment.findFirst.mockResolvedValue(null); // findFirst is given schoolId in its where, so a cross-school row is never returned
    await expect(service.removeAssignment(ACTOR, "school-1", "teacher-1", "assignment-1")).rejects.toThrow(NotFoundException);
    expect(prisma.teacherAssignment.findFirst).toHaveBeenCalledWith({
      where: { id: "assignment-1", teacherId: "teacher-1", schoolId: "school-1" },
    });
  });

  it("removeAssignment deletes the assignment once ownership is confirmed", async () => {
    prisma.teacher.findFirst.mockResolvedValue({ id: "teacher-1" });
    prisma.teacherAssignment.findFirst.mockResolvedValue({ id: "assignment-1", teacherId: "teacher-1" });
    const result = await service.removeAssignment(ACTOR, "school-1", "teacher-1", "assignment-1");
    expect(prisma.teacherAssignment.delete).toHaveBeenCalledWith({ where: { id: "assignment-1" } });
    expect(result).toEqual({ success: true });
  });
});

describe("TeachersService.searchAcrossOrg", () => {
  let prisma: MockPrisma;
  let service: TeachersService;

  beforeEach(() => {
    prisma = createMockPrisma();
    ({ service } = createService(prisma));
  });

  it("returns nothing for a query shorter than 2 characters, without querying the database", async () => {
    const result = await service.searchAcrossOrg(ACTOR, "school-1", "A");
    expect(result).toEqual([]);
    expect(prisma.teacher.findMany).not.toHaveBeenCalled();
  });

  it("searches by first/last name, employee number, teacherCode, and email", async () => {
    prisma.teacher.findMany.mockResolvedValue([]);
    await service.searchAcrossOrg(ACTOR, "school-1", "Ahmed");
    const where = prisma.teacher.findMany.mock.calls[0][0].where;
    expect(where.OR).toContainEqual({ firstName: { contains: "Ahmed", mode: "insensitive" } });
    expect(where.OR).toContainEqual({ lastName: { contains: "Ahmed", mode: "insensitive" } });
    expect(where.OR).toContainEqual({ employeeNumber: { contains: "Ahmed", mode: "insensitive" } });
    expect(where.OR).toContainEqual({ teacherCode: { contains: "Ahmed", mode: "insensitive" } });
    expect(where.OR).toContainEqual({ email: { contains: "Ahmed", mode: "insensitive" } });
  });

  it("lets an admin who knows the permanent Teacher ID search by it directly, e.g. after two similarly-named results", async () => {
    prisma.teacher.findMany.mockResolvedValue([]);
    await service.searchAcrossOrg(ACTOR, "school-1", "TCH-00042");
    const where = prisma.teacher.findMany.mock.calls[0][0].where;
    expect(where.OR).toContainEqual({ teacherCode: { contains: "TCH-00042", mode: "insensitive" } });
  });

  // The whole point: results span every school in the organization, not
  // just schoolId — an admin at School B must be able to find a teacher
  // whose home Teacher row is at School A.
  it("scopes the search to the organization, not to a single school", async () => {
    prisma.teacher.findMany.mockResolvedValue([]);
    await service.searchAcrossOrg(ACTOR, "school-1", "Ahmed");
    const where = prisma.teacher.findMany.mock.calls[0][0].where;
    expect(where.school).toEqual({ organizationId: "org-1" });
    expect(where.schoolId).toBeUndefined();
  });

  it("includes each result's home school, so the admin can see where they already teach", async () => {
    prisma.teacher.findMany.mockResolvedValue([
      { id: "teacher-1", firstName: "Ahmed", lastName: "Mohamed", employeeNumber: "EMP-0002", teacherCode: "TCH-00042", email: null, phone: "0611111111", school: { id: "school-2", name: "Ilays Secondary School", type: "SECONDARY" } },
    ]);
    const result = await service.searchAcrossOrg(ACTOR, "school-1", "Ahmed");
    expect(result[0].school).toEqual({ id: "school-2", name: "Ilays Secondary School", type: "SECONDARY" });
  });

  it("includes each result's permanent teacherCode, so two similarly-named results can be told apart", async () => {
    prisma.teacher.findMany.mockResolvedValue([
      { id: "teacher-1", firstName: "Ahmed", lastName: "Mohamed", employeeNumber: "EMP-0002", teacherCode: "TCH-00042", email: null, phone: null, school: { id: "school-2", name: "Ilays Secondary School", type: "SECONDARY" } },
    ]);
    const result = await service.searchAcrossOrg(ACTOR, "school-1", "Ahmed");
    expect(result[0].teacherCode).toBe("TCH-00042");
  });
});

describe("TeachersService.inviteLogin", () => {
  let prisma: MockPrisma;
  let service: TeachersService;
  let audit: { record: jest.Mock };

  beforeEach(() => {
    prisma = createMockPrisma();
    ({ service, audit } = createService(prisma));
    prisma.role.findUniqueOrThrow.mockResolvedValue({ id: "role-teacher" });
    prisma.user.upsert.mockResolvedValue({ id: "user-1", email: "t@example.com" });
  });

  it("throws NotFoundException for a teacher not in this school", async () => {
    prisma.teacher.findFirst.mockResolvedValue(null);
    await expect(service.inviteLogin(ACTOR, "school-1", "teacher-1")).rejects.toThrow(NotFoundException);
  });

  it("throws ConflictException when the teacher already has a login", async () => {
    prisma.teacher.findFirst.mockResolvedValue({ id: "teacher-1", userId: "existing-user" });
    await expect(service.inviteLogin(ACTOR, "school-1", "teacher-1")).rejects.toThrow(
      "This teacher already has a login",
    );
  });

  it("throws BadRequestException when neither an override email nor the teacher's own email exists", async () => {
    prisma.teacher.findFirst.mockResolvedValue({ id: "teacher-1", userId: null, email: null });
    await expect(service.inviteLogin(ACTOR, "school-1", "teacher-1")).rejects.toThrow(
      "This teacher has no email on file — provide one to send the invite",
    );
  });

  it("throws ConflictException when the target email already has an ACTIVE account", async () => {
    prisma.teacher.findFirst.mockResolvedValue({ id: "teacher-1", userId: null, email: "t@example.com" });
    prisma.user.findUnique.mockResolvedValue({ id: "other-user", status: "ACTIVE" });
    await expect(service.inviteLogin(ACTOR, "school-1", "teacher-1")).rejects.toThrow(
      "A user with this email already has an active account",
    );
  });

  it("allows re-inviting an email whose existing account is still PENDING_SETUP (not ACTIVE)", async () => {
    prisma.teacher.findFirst.mockResolvedValue({ id: "teacher-1", userId: null, email: "t@example.com" });
    prisma.user.findUnique.mockResolvedValue({ id: "other-user", status: "PENDING_SETUP" });
    await expect(service.inviteLogin(ACTOR, "school-1", "teacher-1")).resolves.toBeDefined();
  });

  it("prefers an explicit override email over the teacher's own email on file", async () => {
    prisma.teacher.findFirst.mockResolvedValue({ id: "teacher-1", userId: null, email: "old@example.com" });
    await service.inviteLogin(ACTOR, "school-1", "teacher-1", "new@example.com");
    expect(prisma.user.upsert).toHaveBeenCalledWith(expect.objectContaining({ where: { email: "new@example.com" } }));
  });

  it("links the teacher to the new/existing user, grants the TEACHER role and this school, and creates an invitation", async () => {
    prisma.teacher.findFirst.mockResolvedValue({ id: "teacher-1", firstName: "Amina", lastName: "Hassan", userId: null, email: "t@example.com" });

    await service.inviteLogin(ACTOR, "school-1", "teacher-1");

    expect(prisma.teacher.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "teacher-1" }, data: expect.objectContaining({ userId: "user-1", email: "t@example.com" }) }),
    );
    expect(prisma.userRole.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ create: { userId: "user-1", roleId: "role-teacher" } }),
    );
    expect(prisma.userSchool.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ create: { userId: "user-1", schoolId: "school-1" } }),
    );
    expect(prisma.invitation.create).toHaveBeenCalled();
  });

  it("records a TEACHER_LOGIN_INVITED audit entry", async () => {
    prisma.teacher.findFirst.mockResolvedValue({ id: "teacher-1", firstName: "Amina", lastName: "Hassan", userId: null, email: "t@example.com" });
    await service.inviteLogin(ACTOR, "school-1", "teacher-1");
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: "TEACHER_LOGIN_INVITED", after: { email: "t@example.com" } }),
      prisma,
    );
  });

  it("returns the resolved email and an acceptUrl carrying a real token, never the raw token itself outside the URL", async () => {
    prisma.teacher.findFirst.mockResolvedValue({ id: "teacher-1", firstName: "Amina", lastName: "Hassan", userId: null, email: "t@example.com" });
    const result = await service.inviteLogin(ACTOR, "school-1", "teacher-1");
    expect(result.email).toBe("t@example.com");
    expect(result.acceptUrl).toMatch(/\/accept-invite\?token=[0-9a-f]{64}$/);
  });
});

describe("TeachersService.resendInvite", () => {
  let prisma: MockPrisma;
  let service: TeachersService;
  let audit: { record: jest.Mock };

  beforeEach(() => {
    prisma = createMockPrisma();
    ({ service, audit } = createService(prisma));
    prisma.role.findUniqueOrThrow.mockResolvedValue({ id: "role-teacher" });
  });

  it("throws NotFoundException for a teacher not in this school", async () => {
    prisma.teacher.findFirst.mockResolvedValue(null);
    await expect(service.resendInvite(ACTOR, "school-1", "teacher-1")).rejects.toThrow(NotFoundException);
  });

  it("throws BadRequestException when the teacher has no login yet — that's Invite to log in's job", async () => {
    prisma.teacher.findFirst.mockResolvedValue({ id: "teacher-1", userId: null, user: null });
    await expect(service.resendInvite(ACTOR, "school-1", "teacher-1")).rejects.toThrow(
      "This teacher has no login yet — use Invite to log in instead",
    );
  });

  it("throws ConflictException once the teacher has already finished setup (ACTIVE) — nothing left to resend", async () => {
    prisma.teacher.findFirst.mockResolvedValue({
      id: "teacher-1",
      userId: "user-1",
      user: { id: "user-1", email: "t@example.com", status: "ACTIVE" },
    });
    await expect(service.resendInvite(ACTOR, "school-1", "teacher-1")).rejects.toThrow(
      "This teacher has already completed their login setup",
    );
  });

  it("revokes any still-pending older invitations for this user before creating a fresh one", async () => {
    prisma.teacher.findFirst.mockResolvedValue({
      id: "teacher-1",
      firstName: "Amina",
      lastName: "Hassan",
      userId: "user-1",
      user: { id: "user-1", email: "t@example.com", status: "PENDING_SETUP" },
    });

    await service.resendInvite(ACTOR, "school-1", "teacher-1");

    expect(prisma.invitation.updateMany).toHaveBeenCalledWith({
      where: { userId: "user-1", status: "PENDING" },
      data: { status: "REVOKED" },
    });
    expect(prisma.invitation.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ userId: "user-1", schoolId: "school-1" }) }),
    );
  });

  it("records a TEACHER_LOGIN_INVITE_RESENT audit entry", async () => {
    prisma.teacher.findFirst.mockResolvedValue({
      id: "teacher-1",
      firstName: "Amina",
      lastName: "Hassan",
      userId: "user-1",
      user: { id: "user-1", email: "t@example.com", status: "PENDING_SETUP" },
    });

    await service.resendInvite(ACTOR, "school-1", "teacher-1");

    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: "TEACHER_LOGIN_INVITE_RESENT", after: { email: "t@example.com" } }),
      prisma,
    );
  });

  it("returns the same teacher's email with a fresh acceptUrl token", async () => {
    prisma.teacher.findFirst.mockResolvedValue({
      id: "teacher-1",
      firstName: "Amina",
      lastName: "Hassan",
      userId: "user-1",
      user: { id: "user-1", email: "t@example.com", status: "PENDING_SETUP" },
    });

    const result = await service.resendInvite(ACTOR, "school-1", "teacher-1");

    expect(result.email).toBe("t@example.com");
    expect(result.acceptUrl).toMatch(/\/accept-invite\?token=[0-9a-f]{64}$/);
  });
});
