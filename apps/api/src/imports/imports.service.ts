import { BadRequestException, Injectable, Logger, NotFoundException, OnModuleInit } from "@nestjs/common";
import { parse } from "csv-parse/sync";
import { GuardianRelationship, Sex, type Prisma } from "@school-erp/database";
import { PrismaService } from "../prisma/prisma.service";
import { SchoolsService } from "../schools/schools.service";
import { StudentsService } from "../students/students.service";
import { AuditService } from "../audit/audit.service";
import { AuditAction, AuditModuleName } from "../audit/audit-actions";
import { resolveAuthenticatedUser } from "../auth/resolve-authenticated-user";
import type { AuthenticatedUser } from "../auth/types/authenticated-user";
import type { CreateStudentDto } from "../students/dto/create-student.dto";

const REQUIRED_COLUMNS = ["firstName", "lastName", "dateOfBirth", "sex", "academicYear", "className", "sectionName"];

// A staged, two-phase pipeline — nothing is ever written to the Student
// table until an admin has seen the full row-level report and explicitly
// commits. Phase 1 (stage): parse + validate + duplicate-check every row,
// writing only ImportRow outcomes (READY/DUPLICATE_PENDING/ERROR). Phase 2
// (commit, a separate admin action): create a real Student for every READY
// row. Both phases run in the background (fired from the controller-facing
// methods without being awaited) so a large CSV never blocks the request or
// risks an HTTP timeout — see uploadStudentsCsv/commitStudents.
//
// This runs in-process rather than on a Redis-backed queue (BullMQ) —
// deliberate: Redis isn't a reliable dependency in this project today (see
// RedisModule/HealthController, which already treats it as optional
// everywhere else), and making a core admin workflow depend on it would be
// a regression, not an improvement. The trade-off is durability: if the API
// process restarts mid-stage or mid-commit, in-flight work stops. onModuleInit
// below covers that by resuming any batch still STAGING/COMMITTING on boot —
// safe to do unconditionally only because this app runs as a single
// instance; a horizontally-scaled deployment would need a real lock here.
@Injectable()
export class ImportsService implements OnModuleInit {
  private readonly logger = new Logger(ImportsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly schools: SchoolsService,
    private readonly students: StudentsService,
    private readonly audit: AuditService,
  ) {}

  async onModuleInit() {
    const stuck = await this.prisma.importBatch.findMany({
      where: { status: { in: ["STAGING", "COMMITTING"] } },
    });
    for (const batch of stuck) {
      this.logger.warn(`Resuming import batch ${batch.id} (was ${batch.status} at boot)`);
      if (batch.status === "STAGING") {
        this.stageBatch(batch.id, batch.organizationId, batch.schoolId).catch((err) => this.markFailed(batch.id, err));
      } else {
        const actor = await resolveAuthenticatedUser(this.prisma, batch.uploadedByUserId);
        if (actor) {
          this.commitBatch(batch.id, actor, batch.schoolId).catch((err) => this.markFailed(batch.id, err));
        } else {
          await this.markFailed(batch.id, new Error("Uploading user no longer exists"));
        }
      }
    }
  }

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
        status: "STAGING",
      },
    });

    await this.prisma.importRow.createMany({
      data: records.map((raw, i) => ({ batchId: batch.id, rowNumber: i + 2, rawData: raw, status: "PENDING" as const })),
    });

    // Not awaited — the request returns with the batch in STAGING; the
    // frontend polls getBatch until it leaves that state.
    this.stageBatch(batch.id, actor.organizationId!, schoolId).catch((err) => this.markFailed(batch.id, err));

    // Re-fetched with rows included (all PENDING at this instant) so the
    // response shape matches every other batch-detail response the
    // frontend gets from getBatch/resolveRow/commitStudents.
    return this.prisma.importBatch.findUniqueOrThrow({
      where: { id: batch.id },
      include: { rows: { orderBy: { rowNumber: "asc" } } },
    });
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

  // Pre-commit only — resolves a DUPLICATE_PENDING row to either READY
  // (admin confirmed it's a different person; created once commitStudents
  // runs) or SKIPPED. Never creates a Student directly, unlike the old
  // single-phase flow.
  async resolveRow(actor: AuthenticatedUser, schoolId: string, batchId: string, rowId: string, action: "confirm" | "skip") {
    await this.schools.findOneAccessibleOrThrow(actor, schoolId);
    const row = await this.prisma.importRow.findFirst({ where: { id: rowId, batchId, batch: { schoolId } } });
    if (!row) throw new NotFoundException("Import row not found");
    if (row.status !== "DUPLICATE_PENDING") {
      throw new BadRequestException("This row isn't awaiting a duplicate decision");
    }

    await this.prisma.importRow.update({
      where: { id: rowId },
      data:
        action === "skip"
          ? { status: "SKIPPED" }
          : { status: "READY", duplicateCandidates: undefined, errorMessage: null },
    });

    return this.refreshCounts(batchId);
  }

  // The explicit admin action the whole staged flow exists for — nothing
  // before this point ever touches the Student table. Refuses while any
  // row is still DUPLICATE_PENDING so nothing gets silently skipped.
  async commitStudents(actor: AuthenticatedUser, schoolId: string, batchId: string) {
    await this.schools.findOneAccessibleOrThrow(actor, schoolId);
    const batch = await this.prisma.importBatch.findFirst({ where: { id: batchId, schoolId } });
    if (!batch) throw new NotFoundException("Import batch not found");
    if (batch.status !== "READY_FOR_REVIEW") {
      throw new BadRequestException(`This batch is ${batch.status.toLowerCase().replace("_", " ")}, not ready to commit`);
    }
    const stillPending = await this.prisma.importRow.count({ where: { batchId, status: "DUPLICATE_PENDING" } });
    if (stillPending > 0) {
      throw new BadRequestException(`${stillPending} row(s) still need a duplicate decision before this can be committed`);
    }

    await this.prisma.importBatch.update({ where: { id: batchId }, data: { status: "COMMITTING" } });
    this.commitBatch(batchId, actor, schoolId).catch((err) => this.markFailed(batchId, err));

    return this.getBatch(actor, schoolId, batchId);
  }

  // --- Background phases ---------------------------------------------------

  private async stageBatch(batchId: string, organizationId: string, schoolId: string) {
    const rows = await this.prisma.importRow.findMany({ where: { batchId, status: "PENDING" } });

    for (const row of rows) {
      const raw = row.rawData as Record<string, string>;
      // false here is purely for readability — buildDto's confirmDespiteDuplicates
      // value only matters once a dto reaches students.create(), which never
      // happens during staging; the actual duplicate decision is the
      // findDuplicateCandidates call right below.
      const built = await this.buildDto(schoolId, raw, false);
      if (!built.ok) {
        await this.prisma.importRow.update({ where: { id: row.id }, data: { status: "ERROR", errorMessage: built.error } });
        continue;
      }

      const dateOfBirth = new Date(built.dto.dateOfBirth);
      const candidates = await this.students.findDuplicateCandidates(organizationId, built.dto, dateOfBirth);
      if (candidates.length > 0) {
        await this.prisma.importRow.update({
          where: { id: row.id },
          data: { status: "DUPLICATE_PENDING", duplicateCandidates: candidates as unknown as Prisma.InputJsonValue },
        });
      } else {
        await this.prisma.importRow.update({ where: { id: row.id }, data: { status: "READY" } });
      }
    }

    await this.refreshCounts(batchId, "READY_FOR_REVIEW");
  }

  private async commitBatch(batchId: string, actor: AuthenticatedUser, schoolId: string) {
    const rows = await this.prisma.importRow.findMany({ where: { batchId, status: "READY" } });

    for (const row of rows) {
      const raw = row.rawData as Record<string, string>;
      // confirmDespiteDuplicates: true — the duplicate decision (if any) was
      // already made during staging/resolveRow; re-running that check here
      // would either be redundant (no duplicate) or wrongly re-block a row
      // an admin explicitly confirmed.
      const built = await this.buildDto(schoolId, raw, true);
      if (!built.ok) {
        await this.prisma.importRow.update({ where: { id: row.id }, data: { status: "ERROR", errorMessage: built.error } });
        continue;
      }
      try {
        const created = await this.students.create(actor, schoolId, built.dto);
        await this.prisma.importRow.update({
          where: { id: row.id },
          data: { status: "CREATED", studentId: created.student.id },
        });
      } catch (err) {
        await this.prisma.importRow.update({
          where: { id: row.id },
          data: { status: "ERROR", errorMessage: err instanceof Error ? err.message : "Failed to create student" },
        });
      }
    }

    const rowsFinal = await this.prisma.importRow.findMany({ where: { batchId } });
    const createdCount = rowsFinal.filter((r) => r.status === "CREATED").length;
    const errorCount = rowsFinal.filter((r) => r.status === "ERROR").length;
    const skippedCount = rowsFinal.filter((r) => r.status === "SKIPPED").length;

    const batch = await this.prisma.importBatch.update({
      where: { id: batchId },
      data: { status: "COMPLETED", createdCount, errorCount, skippedCount, completedAt: new Date() },
    });

    // One STUDENT_CREATED event per row already came from students.create()
    // itself — this is only the batch-level summary.
    await this.audit.record({
      actor,
      organizationId: actor.organizationId,
      schoolId,
      action: AuditAction.STUDENT_IMPORTED,
      module: AuditModuleName.STUDENTS,
      resourceType: "ImportBatch",
      resourceId: batchId,
      severity: errorCount > 0 ? "WARNING" : "INFO",
      after: { createdCount, errorCount, skippedCount, totalRows: batch.totalRows },
    });
  }

  private async refreshCounts(batchId: string, andSetStatus?: "READY_FOR_REVIEW") {
    const rows = await this.prisma.importRow.findMany({ where: { batchId } });
    const pendingCount = rows.filter((r) => r.status === "DUPLICATE_PENDING").length;
    const errorCount = rows.filter((r) => r.status === "ERROR").length;

    return this.prisma.importBatch.update({
      where: { id: batchId },
      data: { pendingCount, errorCount, ...(andSetStatus ? { status: andSetStatus } : {}) },
      include: { rows: { orderBy: { rowNumber: "asc" } } },
    });
  }

  private async markFailed(batchId: string, err: unknown) {
    this.logger.error(`Import batch ${batchId} failed`, err instanceof Error ? err.stack : String(err));
    await this.prisma.importBatch.update({ where: { id: batchId }, data: { status: "FAILED" } }).catch(() => undefined);
  }

  // Shared between staging and commit — the CSV row is the single source of
  // truth for both, so the mapping only lives here once.
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

    // A class belongs to one academic year, so the name is looked up WITHIN the
    // row's academic year (never across years).
    const klass = await this.prisma.class.findFirst({
      where: { division: { schoolId }, academicYearId: academicYear.id, name: { equals: className, mode: "insensitive" } },
    });
    if (!klass) return { ok: false, error: `No class named "${className}" in academic year "${academicYear.name}" in this school` };

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
        legacyStudentNumber: raw.legacyStudentNumber?.trim() || undefined,
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
}
