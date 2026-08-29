import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { parse } from "csv-parse/sync";
import { GuardianRelationship, Sex, type Prisma } from "@school-erp/database";
import { PrismaService } from "../prisma/prisma.service";
import { SchoolsService } from "../schools/schools.service";
import { StudentsService } from "../students/students.service";
import type { AuthenticatedUser } from "../auth/types/authenticated-user";
import type { CreateStudentDto } from "../students/dto/create-student.dto";

const REQUIRED_COLUMNS = ["firstName", "lastName", "dateOfBirth", "sex", "academicYear", "className", "sectionName"];

interface DuplicateCandidate {
  id: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
}

@Injectable()
export class ImportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly schools: SchoolsService,
    private readonly students: StudentsService,
  ) {}

  async uploadStudentsCsv(actor: AuthenticatedUser, schoolId: string, file: Express.Multer.File) {
    await this.schools.findOneAccessibleOrThrow(actor, schoolId);
    if (!file) throw new BadRequestException("No file uploaded");

    let records: Record<string, string>[];
    try {
      records = parse(file.buffer, { columns: true, trim: true, skip_empty_lines: true });
    } catch {
      throw new BadRequestException("Could not parse this file as CSV");
    }
    if (records.length === 0) throw new BadRequestException("The CSV file has no data rows");

    const missingColumns = REQUIRED_COLUMNS.filter((col) => !(col in records[0]));
    if (missingColumns.length > 0) {
      throw new BadRequestException(`Missing required column(s): ${missingColumns.join(", ")}`);
    }

    const batch = await this.prisma.importBatch.create({
      data: {
        organizationId: actor.organizationId!,
        schoolId,
        uploadedByUserId: actor.id,
        fileName: file.originalname,
        totalRows: records.length,
      },
    });

    for (let i = 0; i < records.length; i++) {
      await this.processRow(actor, schoolId, batch.id, i + 2, records[i]);
    }

    return this.finalizeBatch(actor, schoolId, batch.id);
  }

  async listBatches(actor: AuthenticatedUser, schoolId: string) {
    await this.schools.findOneAccessibleOrThrow(actor, schoolId);
    return this.prisma.importBatch.findMany({ where: { schoolId }, orderBy: { createdAt: "desc" } });
  }

  async getBatch(actor: AuthenticatedUser, schoolId: string, batchId: string) {
    await this.schools.findOneAccessibleOrThrow(actor, schoolId);
    const batch = await this.prisma.importBatch.findFirst({
      where: { id: batchId, schoolId },
      include: { rows: { orderBy: { rowNumber: "asc" } } },
    });
    if (!batch) throw new NotFoundException("Import batch not found");
    return batch;
  }

  async resolveRow(actor: AuthenticatedUser, schoolId: string, batchId: string, rowId: string, action: "confirm" | "skip") {
    await this.schools.findOneAccessibleOrThrow(actor, schoolId);
    const row = await this.prisma.importRow.findFirst({ where: { id: rowId, batchId, batch: { schoolId } } });
    if (!row) throw new NotFoundException("Import row not found");
    if (row.status !== "DUPLICATE_PENDING") {
      throw new BadRequestException("This row isn't awaiting a duplicate decision");
    }

    if (action === "skip") {
      await this.prisma.importRow.update({ where: { id: rowId }, data: { status: "SKIPPED" } });
    } else {
      const raw = row.rawData as Record<string, string>;
      const dto = await this.buildDto(schoolId, raw, true);
      if (!dto.ok) {
        await this.prisma.importRow.update({ where: { id: rowId }, data: { status: "ERROR", errorMessage: dto.error } });
      } else {
        try {
          const created = await this.students.create(actor, schoolId, dto.dto);
          await this.prisma.importRow.update({
            where: { id: rowId },
            data: { status: "CREATED", studentId: created.student.id, errorMessage: null, duplicateCandidates: undefined },
          });
        } catch (err) {
          await this.prisma.importRow.update({
            where: { id: rowId },
            data: { status: "ERROR", errorMessage: err instanceof Error ? err.message : "Failed to create student" },
          });
        }
      }
    }

    return this.finalizeBatch(actor, schoolId, batchId);
  }

  private async processRow(
    actor: AuthenticatedUser,
    schoolId: string,
    batchId: string,
    rowNumber: number,
    raw: Record<string, string>,
  ) {
    const dto = await this.buildDto(schoolId, raw, false);
    if (!dto.ok) {
      await this.prisma.importRow.create({
        data: { batchId, rowNumber, rawData: raw, status: "ERROR", errorMessage: dto.error },
      });
      return;
    }

    try {
      const created = await this.students.create(actor, schoolId, dto.dto);
      await this.prisma.importRow.create({
        data: { batchId, rowNumber, rawData: raw, status: "CREATED", studentId: created.student.id },
      });
    } catch (err) {
      if (err instanceof ConflictException) {
        const body = err.getResponse();
        const candidates =
          typeof body === "object" && body && "possibleDuplicates" in body
            ? (body as { possibleDuplicates: DuplicateCandidate[] }).possibleDuplicates
            : null;
        if (candidates) {
          await this.prisma.importRow.create({
            data: {
              batchId,
              rowNumber,
              rawData: raw,
              status: "DUPLICATE_PENDING",
              duplicateCandidates: candidates as unknown as Prisma.InputJsonValue,
            },
          });
          return;
        }
      }
      await this.prisma.importRow.create({
        data: {
          batchId,
          rowNumber,
          rawData: raw,
          status: "ERROR",
          errorMessage: err instanceof Error ? err.message : "Failed to create student",
        },
      });
    }
  }

  // Shared between the first pass and row resolution — the CSV row is the
  // single source of truth for both, so the mapping only lives here once.
  private async buildDto(
    schoolId: string,
    raw: Record<string, string>,
    confirmDespiteDuplicates: boolean,
  ): Promise<{ ok: true; dto: CreateStudentDto } | { ok: false; error: string }> {
    const firstName = raw.firstName?.trim();
    const lastName = raw.lastName?.trim();
    const dateOfBirth = raw.dateOfBirth?.trim();
    const sexRaw = raw.sex?.trim().toUpperCase();
    const academicYearName = raw.academicYear?.trim();
    const className = raw.className?.trim();
    const sectionName = raw.sectionName?.trim();

    if (!firstName || !lastName) return { ok: false, error: "firstName and lastName are required" };
    if (!dateOfBirth || Number.isNaN(Date.parse(dateOfBirth))) {
      return { ok: false, error: "dateOfBirth is missing or not a valid date" };
    }
    if (sexRaw !== "MALE" && sexRaw !== "FEMALE") {
      return { ok: false, error: `sex must be MALE or FEMALE, got "${raw.sex}"` };
    }
    if (!academicYearName || !className || !sectionName) {
      return { ok: false, error: "academicYear, className, and sectionName are required" };
    }

    const academicYear = await this.prisma.academicYear.findFirst({
      where: { schoolId, name: { equals: academicYearName, mode: "insensitive" } },
    });
    if (!academicYear) return { ok: false, error: `No academic year named "${academicYearName}" in this school` };

    const klass = await this.prisma.class.findFirst({
      where: { division: { schoolId }, name: { equals: className, mode: "insensitive" } },
    });
    if (!klass) return { ok: false, error: `No class named "${className}" in this school` };

    const section = await this.prisma.section.findFirst({
      where: { classId: klass.id, name: { equals: sectionName, mode: "insensitive" } },
    });
    if (!section) return { ok: false, error: `No section named "${sectionName}" in class "${className}"` };

    const rollNumberRaw = raw.rollNumber?.trim();
    const rollNumber = rollNumberRaw ? Number(rollNumberRaw) : undefined;
    if (rollNumberRaw && (!Number.isInteger(rollNumber) || rollNumber! < 1)) {
      return { ok: false, error: `rollNumber must be a positive whole number, got "${rollNumberRaw}"` };
    }

    const guardianFirstName = raw.guardianFirstName?.trim();
    const guardianLastName = raw.guardianLastName?.trim();
    let guardians: CreateStudentDto["guardians"];
    if (guardianFirstName || guardianLastName) {
      if (!guardianFirstName || !guardianLastName) {
        return { ok: false, error: "guardianFirstName and guardianLastName must both be provided together" };
      }
      const relationshipRaw = (raw.guardianRelationship?.trim().toUpperCase() || "FATHER") as GuardianRelationship;
      if (!Object.values(GuardianRelationship).includes(relationshipRaw)) {
        return { ok: false, error: `guardianRelationship must be one of FATHER, MOTHER, GUARDIAN, OTHER` };
      }
      guardians = [
        {
          firstName: guardianFirstName,
          lastName: guardianLastName,
          phone: raw.guardianPhone?.trim() || undefined,
          email: raw.guardianEmail?.trim() || undefined,
          relationship: relationshipRaw,
          isPrimaryContact: true,
        },
      ];
    }

    return {
      ok: true,
      dto: {
        firstName,
        lastName,
        dateOfBirth,
        sex: sexRaw as Sex,
        enrollment: {
          academicYearId: academicYear.id,
          classId: klass.id,
          sectionId: section.id,
          studentNumber: raw.studentNumber?.trim() || undefined,
          rollNumber,
        },
        guardians,
        confirmDespiteDuplicates,
      },
    };
  }

  private async finalizeBatch(actor: AuthenticatedUser, schoolId: string, batchId: string) {
    const rows = await this.prisma.importRow.findMany({ where: { batchId } });
    const createdCount = rows.filter((r) => r.status === "CREATED").length;
    const errorCount = rows.filter((r) => r.status === "ERROR").length;
    const pendingCount = rows.filter((r) => r.status === "DUPLICATE_PENDING").length;
    const skippedCount = rows.filter((r) => r.status === "SKIPPED").length;
    const status = pendingCount > 0 ? "NEEDS_REVIEW" : "COMPLETED";

    const batch = await this.prisma.importBatch.update({
      where: { id: batchId },
      data: {
        createdCount,
        errorCount,
        pendingCount,
        skippedCount,
        status,
        completedAt: status === "COMPLETED" ? new Date() : null,
      },
      include: { rows: { orderBy: { rowNumber: "asc" } } },
    });

    if (status === "COMPLETED") {
      await this.prisma.auditLog.create({
        data: {
          organizationId: actor.organizationId,
          schoolId,
          actorUserId: actor.id,
          action: "students.import",
          resource: "ImportBatch",
          resourceId: batchId,
          after: { createdCount, errorCount, skippedCount, totalRows: batch.totalRows },
        },
      });
    }

    return batch;
  }
}
