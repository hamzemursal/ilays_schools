import { BadRequestException, NotFoundException } from "@nestjs/common";
import { ImportsService } from "./imports.service";
import { PrismaService } from "../prisma/prisma.service";
import { SchoolsService } from "../schools/schools.service";
import { StudentsService } from "../students/students.service";
import { AuditService } from "../audit/audit.service";
import type { AuthenticatedUser } from "../auth/types/authenticated-user";

const ACTOR: AuthenticatedUser = {
  id: "admin-1",
  email: "admin@example.com",
  organizationId: "org-1",
  roles: ["SCHOOL_ADMIN"],
  permissions: ["imports.create"],
  schoolIds: ["school-1"],
};

function csvFile(content: string): Express.Multer.File {
  return { buffer: Buffer.from(content), originalname: "students.csv" } as Express.Multer.File;
}

const VALID_HEADER = "firstName,lastName,dateOfBirth,sex,academicYear,className,sectionName";
const VALID_ROW = "Amina,Warsame,2015-03-12,FEMALE,2027,Class 7,A";

describe("ImportsService", () => {
  let prisma: {
    importBatch: {
      create: jest.Mock;
      findMany: jest.Mock;
      findFirst: jest.Mock;
      findUniqueOrThrow: jest.Mock;
      update: jest.Mock;
    };
    importRow: { createMany: jest.Mock; findMany: jest.Mock; findFirst: jest.Mock; update: jest.Mock; count: jest.Mock };
  };
  let schools: { findOneAccessibleOrThrow: jest.Mock };
  let students: { findDuplicateCandidates: jest.Mock; create: jest.Mock };
  let audit: { record: jest.Mock };
  let service: ImportsService;

  beforeEach(() => {
    prisma = {
      importBatch: {
        create: jest.fn().mockResolvedValue({ id: "batch-1", status: "STAGING" }),
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn(),
        findUniqueOrThrow: jest.fn().mockResolvedValue({ id: "batch-1", status: "STAGING", rows: [] }),
        update: jest.fn().mockResolvedValue({}),
      },
      importRow: {
        createMany: jest.fn().mockResolvedValue({ count: 1 }),
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn(),
        update: jest.fn().mockResolvedValue({}),
        count: jest.fn().mockResolvedValue(0),
      },
    };
    schools = { findOneAccessibleOrThrow: jest.fn().mockResolvedValue(undefined) };
    students = { findDuplicateCandidates: jest.fn().mockResolvedValue([]), create: jest.fn() };
    audit = { record: jest.fn().mockResolvedValue(undefined) };
    service = new ImportsService(
      prisma as unknown as PrismaService,
      schools as unknown as SchoolsService,
      students as unknown as StudentsService,
      audit as unknown as AuditService,
    );
  });

  describe("uploadStudentsCsv", () => {
    it("rejects when no file is uploaded", async () => {
      await expect(service.uploadStudentsCsv(ACTOR, "school-1", undefined as never)).rejects.toThrow(BadRequestException);
      expect(prisma.importBatch.create).not.toHaveBeenCalled();
    });

    it("rejects a file that isn't valid CSV", async () => {
      const file = csvFile("not,even\nclose\"broken");
      // Malformed quoting is what actually throws in csv-parse; a plain
      // two-column mismatch parses fine, so use a genuinely broken quote.
      await expect(service.uploadStudentsCsv(ACTOR, "school-1", file)).rejects.toThrow(BadRequestException);
    });

    it("rejects a CSV with no data rows", async () => {
      const file = csvFile(VALID_HEADER + "\n");
      await expect(service.uploadStudentsCsv(ACTOR, "school-1", file)).rejects.toThrow("The CSV file has no data rows");
    });

    it("rejects a CSV missing required columns", async () => {
      const file = csvFile("firstName,lastName\nAmina,Warsame");
      await expect(service.uploadStudentsCsv(ACTOR, "school-1", file)).rejects.toThrow(/Missing required column/);
    });

    it("creates a STAGING batch and PENDING rows, returning immediately without waiting on staging", async () => {
      const file = csvFile(`${VALID_HEADER}\n${VALID_ROW}`);

      const batch = await service.uploadStudentsCsv(ACTOR, "school-1", file);

      expect(batch).toEqual({ id: "batch-1", status: "STAGING", rows: [] });
      expect(prisma.importBatch.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: "STAGING", totalRows: 1 }) }),
      );
      expect(prisma.importRow.createMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: [expect.objectContaining({ batchId: "batch-1", rowNumber: 2, status: "PENDING" })],
        }),
      );
    });
  });

  describe("resolveRow", () => {
    it("throws when the row doesn't exist", async () => {
      prisma.importRow.findFirst.mockResolvedValue(null);

      await expect(service.resolveRow(ACTOR, "school-1", "batch-1", "row-1", "skip")).rejects.toThrow(NotFoundException);
    });

    it("refuses to resolve a row that isn't DUPLICATE_PENDING", async () => {
      prisma.importRow.findFirst.mockResolvedValue({ id: "row-1", status: "READY" });

      await expect(service.resolveRow(ACTOR, "school-1", "batch-1", "row-1", "skip")).rejects.toThrow(BadRequestException);
    });

    it("marks a skipped row SKIPPED without touching the Student table", async () => {
      prisma.importRow.findFirst.mockResolvedValue({ id: "row-1", status: "DUPLICATE_PENDING" });

      await service.resolveRow(ACTOR, "school-1", "batch-1", "row-1", "skip");

      expect(prisma.importRow.update).toHaveBeenCalledWith({ where: { id: "row-1" }, data: { status: "SKIPPED" } });
      expect(students.create).not.toHaveBeenCalled();
    });

    it("marks a confirmed row READY (not CREATED) — commit is a separate step", async () => {
      prisma.importRow.findFirst.mockResolvedValue({ id: "row-1", status: "DUPLICATE_PENDING" });

      await service.resolveRow(ACTOR, "school-1", "batch-1", "row-1", "confirm");

      expect(prisma.importRow.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: "row-1" }, data: expect.objectContaining({ status: "READY" }) }),
      );
      expect(students.create).not.toHaveBeenCalled();
    });
  });

  describe("commitStudents", () => {
    it("throws when the batch doesn't exist", async () => {
      prisma.importBatch.findFirst.mockResolvedValue(null);

      await expect(service.commitStudents(ACTOR, "school-1", "batch-1")).rejects.toThrow(NotFoundException);
    });

    it("refuses to commit a batch that isn't READY_FOR_REVIEW", async () => {
      prisma.importBatch.findFirst.mockResolvedValue({ id: "batch-1", status: "STAGING" });

      await expect(service.commitStudents(ACTOR, "school-1", "batch-1")).rejects.toThrow(
        "This batch is staging, not ready to commit",
      );
    });

    it("refuses to commit while rows are still awaiting a duplicate decision", async () => {
      prisma.importBatch.findFirst.mockResolvedValue({ id: "batch-1", status: "READY_FOR_REVIEW" });
      prisma.importRow.count.mockResolvedValue(2);

      await expect(service.commitStudents(ACTOR, "school-1", "batch-1")).rejects.toThrow(
        "2 row(s) still need a duplicate decision",
      );
      expect(prisma.importBatch.update).not.toHaveBeenCalled();
    });

    it("moves the batch to COMMITTING and returns immediately without waiting on commit", async () => {
      prisma.importBatch.findFirst.mockResolvedValue({ id: "batch-1", status: "READY_FOR_REVIEW", schoolId: "school-1" });
      prisma.importRow.count.mockResolvedValue(0);
      // getBatch's own lookup, called at the end to return current state
      prisma.importBatch.findFirst.mockResolvedValueOnce({ id: "batch-1", status: "READY_FOR_REVIEW" }).mockResolvedValueOnce({
        id: "batch-1",
        status: "COMMITTING",
        rows: [],
      });

      const result = await service.commitStudents(ACTOR, "school-1", "batch-1");

      expect(prisma.importBatch.update).toHaveBeenCalledWith({ where: { id: "batch-1" }, data: { status: "COMMITTING" } });
      expect(result).toEqual({ id: "batch-1", status: "COMMITTING", rows: [] });
    });
  });
});
