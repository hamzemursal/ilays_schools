import { ConflictException, NotFoundException } from "@nestjs/common";
import { Prisma } from "@school-erp/database";
import type { AuthenticatedUser } from "../auth/types/authenticated-user";
import { SubjectsService } from "./subjects.service";
import { PrismaService } from "../prisma/prisma.service";
import { SchoolsService } from "../schools/schools.service";

const ACTOR: AuthenticatedUser = {
  id: "admin-1",
  email: "admin@example.com",
  organizationId: "org-1",
  roles: ["SCHOOL_ADMIN"],
  permissions: ["subjects.manage"],
  schoolIds: ["school-1"],
};

function uniqueViolation() {
  return new Prisma.PrismaClientKnownRequestError("Unique constraint failed", { code: "P2002", clientVersion: "test" });
}

type MockPrisma = {
  subject: { findMany: jest.Mock; findFirst: jest.Mock; create: jest.Mock; update: jest.Mock; delete: jest.Mock };
  examSubject: { count: jest.Mock };
  teacherAssignment: { count: jest.Mock };
  classSubject: { count: jest.Mock };
};

function createMockPrisma(): MockPrisma {
  return {
    subject: { findMany: jest.fn(), findFirst: jest.fn(), create: jest.fn(), update: jest.fn(), delete: jest.fn() },
    examSubject: { count: jest.fn().mockResolvedValue(0) },
    teacherAssignment: { count: jest.fn().mockResolvedValue(0) },
    classSubject: { count: jest.fn().mockResolvedValue(0) },
  };
}

function createService(prisma: MockPrisma) {
  const schools = { findOneAccessibleOrThrow: jest.fn().mockResolvedValue(undefined) };
  const service = new SubjectsService(prisma as unknown as PrismaService, schools as unknown as SchoolsService);
  return { service, schools };
}

describe("SubjectsService.list", () => {
  it("checks school access and orders alphabetically", async () => {
    const prisma = createMockPrisma();
    prisma.subject.findMany.mockResolvedValue([]);
    const { service, schools } = createService(prisma);

    await service.list(ACTOR, "school-1");

    expect(schools.findOneAccessibleOrThrow).toHaveBeenCalledWith(ACTOR, "school-1");
    expect(prisma.subject.findMany).toHaveBeenCalledWith({ where: { schoolId: "school-1" }, orderBy: { name: "asc" } });
  });
});

describe("SubjectsService.create", () => {
  let prisma: MockPrisma;
  let service: SubjectsService;

  beforeEach(() => {
    prisma = createMockPrisma();
    ({ service } = createService(prisma));
    prisma.subject.create.mockResolvedValue({ id: "subj-1" });
  });

  it("uses the given code verbatim when provided, never generating one", async () => {
    await service.create(ACTOR, "school-1", { name: "Mathematics", code: "MTH" });
    expect(prisma.subject.create).toHaveBeenCalledWith({ data: { schoolId: "school-1", name: "Mathematics", code: "MTH" } });
    expect(prisma.subject.findFirst).not.toHaveBeenCalled();
  });

  it("generates a 3-letter uppercase code from the name when none is given", async () => {
    prisma.subject.findFirst.mockResolvedValue(null);
    await service.create(ACTOR, "school-1", { name: "mathematics" });
    expect(prisma.subject.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ code: "MAT" }) }));
  });

  it("strips non-letter characters before deriving the code", async () => {
    prisma.subject.findFirst.mockResolvedValue(null);
    await service.create(ACTOR, "school-1", { name: "P.E. 101" });
    expect(prisma.subject.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ code: "PE" }) }));
  });

  it("falls back to 'SUB' when the name has no letters at all", async () => {
    prisma.subject.findFirst.mockResolvedValue(null);
    await service.create(ACTOR, "school-1", { name: "101" });
    expect(prisma.subject.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ code: "SUB" }) }));
  });

  it("appends a numeric suffix when the derived code prefix already exists in this school", async () => {
    prisma.subject.findFirst
      .mockResolvedValueOnce({ id: "existing", code: "MAT" }) // MAT taken
      .mockResolvedValueOnce(null); // MAT2 free

    await service.create(ACTOR, "school-1", { name: "Mathematics" });

    expect(prisma.subject.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ code: "MAT2" }) }));
  });

  it("translates a P2002 violation (duplicate name) into a ConflictException", async () => {
    prisma.subject.create.mockRejectedValue(uniqueViolation());
    await expect(service.create(ACTOR, "school-1", { name: "Mathematics", code: "MTH" })).rejects.toThrow(ConflictException);
    await expect(service.create(ACTOR, "school-1", { name: "Mathematics", code: "MTH" })).rejects.toThrow(
      "A subject with this name already exists in this school",
    );
  });

  it("re-throws non-P2002 errors unchanged", async () => {
    prisma.subject.create.mockRejectedValue(new Error("connection reset"));
    await expect(service.create(ACTOR, "school-1", { name: "Mathematics", code: "MTH" })).rejects.toThrow("connection reset");
  });
});

describe("SubjectsService.update", () => {
  let prisma: MockPrisma;
  let service: SubjectsService;

  beforeEach(() => {
    prisma = createMockPrisma();
    ({ service } = createService(prisma));
  });

  it("throws NotFoundException for a subject not in this school", async () => {
    prisma.subject.findFirst.mockResolvedValue(null);
    await expect(service.update(ACTOR, "school-1", "subj-1", { name: "New" })).rejects.toThrow(NotFoundException);
  });

  it("translates a P2002 violation into a ConflictException on update too", async () => {
    prisma.subject.findFirst.mockResolvedValue({ id: "subj-1" });
    prisma.subject.update.mockRejectedValue(uniqueViolation());
    await expect(service.update(ACTOR, "school-1", "subj-1", { name: "Existing" })).rejects.toThrow(ConflictException);
  });
});

describe("SubjectsService.remove — dependency guards", () => {
  let prisma: MockPrisma;
  let service: SubjectsService;

  beforeEach(() => {
    prisma = createMockPrisma();
    ({ service } = createService(prisma));
    prisma.subject.findFirst.mockResolvedValue({ id: "subj-1" });
  });

  it("throws NotFoundException for a subject not in this school", async () => {
    prisma.subject.findFirst.mockResolvedValue(null);
    await expect(service.remove(ACTOR, "school-1", "subj-1")).rejects.toThrow(NotFoundException);
  });

  it("blocks deletion when the subject is used in an exam, before checking assignments/classes", async () => {
    prisma.examSubject.count.mockResolvedValue(2);
    await expect(service.remove(ACTOR, "school-1", "subj-1")).rejects.toThrow(
      "Cannot delete — this subject is used in 2 exam(s). Remove it from those exams first.",
    );
    expect(prisma.subject.delete).not.toHaveBeenCalled();
  });

  it("blocks deletion when a teacher assignment references it", async () => {
    prisma.teacherAssignment.count.mockResolvedValue(3);
    await expect(service.remove(ACTOR, "school-1", "subj-1")).rejects.toThrow(
      "Cannot delete — 3 teacher assignment(s) reference this subject. Remove those assignments first.",
    );
  });

  it("blocks deletion when it's still assigned to a class", async () => {
    prisma.classSubject.count.mockResolvedValue(1);
    await expect(service.remove(ACTOR, "school-1", "subj-1")).rejects.toThrow(
      "Cannot delete — this subject is assigned to 1 class(es). Unassign it from those classes first.",
    );
  });

  it("deletes only when nothing depends on it", async () => {
    const result = await service.remove(ACTOR, "school-1", "subj-1");
    expect(prisma.subject.delete).toHaveBeenCalledWith({ where: { id: "subj-1" } });
    expect(result).toEqual({ success: true });
  });
});
