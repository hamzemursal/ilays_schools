import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { PrismaService } from "../prisma/prisma.service";
import { StorageService } from "../storage/storage.service";
import { StudentsService } from "../students/students.service";
import { SchoolsService } from "../schools/schools.service";
import { GuardiansService } from "../guardians/guardians.service";
import type { AuthenticatedUser } from "../auth/types/authenticated-user";

const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const ALLOWED_DOCUMENT_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);
const MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5MB
const MAX_DOCUMENT_SIZE_BYTES = 10 * 1024 * 1024; // 10MB — PDFs run larger than a headshot

@Injectable()
export class DocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly students: StudentsService,
    private readonly schools: SchoolsService,
    private readonly guardians: GuardiansService,
  ) {}

  // Parent-portal variant — ownership is "this guardian is linked to this
  // student", not students.view, since a parent has no admin permissions.
  async getChildPhotoUrl(actor: AuthenticatedUser, studentId: string) {
    await this.guardians.assertGuardianCanAccessStudent(actor, studentId);
    return this.getPhotoUrl("STUDENT", studentId);
  }

  async uploadStudentPhoto(actor: AuthenticatedUser, studentId: string, file: Express.Multer.File) {
    const student = await this.students.assertAccessibleStudent(actor, studentId);

    this.assertValidImage(file);
    const extension = file.mimetype.split("/")[1];
    const storageKey = `students/${studentId}/${randomUUID()}.${extension}`;

    await this.storage.upload(storageKey, file.buffer, file.mimetype);

    return this.prisma.mediaFile.create({
      data: {
        organizationId: student.organizationId,
        ownerType: "STUDENT",
        ownerId: studentId,
        kind: "PHOTO",
        storageKey,
        mimeType: file.mimetype,
        sizeBytes: file.size,
        uploadedByUserId: actor.id,
      },
    });
  }

  async getStudentPhotoUrl(actor: AuthenticatedUser, studentId: string) {
    await this.students.assertAccessibleStudent(actor, studentId);
    return this.getPhotoUrl("STUDENT", studentId);
  }

  async uploadTeacherPhoto(actor: AuthenticatedUser, schoolId: string, teacherId: string, file: Express.Multer.File) {
    const teacher = await this.prisma.teacher.findFirst({ where: { id: teacherId, schoolId } });
    if (!teacher) throw new NotFoundException("Teacher not found in this school");
    return this.storeTeacherPhoto(actor, teacher.schoolId, teacherId, file);
  }

  async getTeacherPhotoUrl(actor: AuthenticatedUser, schoolId: string, teacherId: string) {
    await this.schools.findOneAccessibleOrThrow(actor, schoolId);
    const teacher = await this.prisma.teacher.findFirst({ where: { id: teacherId, schoolId } });
    if (!teacher) throw new NotFoundException("Teacher not found in this school");
    return this.getPhotoUrl("TEACHER", teacherId);
  }

  // Self-service variants — the teacher's own id is resolved server-side
  // from the actor's own Teacher profile, never trusted from a URL param.
  async uploadMyPhoto(actor: AuthenticatedUser, file: Express.Multer.File) {
    const teacher = await this.getSelfTeacherOrThrow(actor);
    return this.storeTeacherPhoto(actor, teacher.schoolId, teacher.id, file);
  }

  async getMyPhotoUrl(actor: AuthenticatedUser) {
    const teacher = await this.getSelfTeacherOrThrow(actor);
    return this.getPhotoUrl("TEACHER", teacher.id);
  }

  async uploadMyDocument(actor: AuthenticatedUser, file: Express.Multer.File, label?: string) {
    const teacher = await this.getSelfTeacherOrThrow(actor);
    return this.storeTeacherDocument(actor, teacher.schoolId, teacher.id, file, label);
  }

  async listMyDocuments(actor: AuthenticatedUser) {
    const teacher = await this.getSelfTeacherOrThrow(actor);
    return this.listDocuments("TEACHER", teacher.id);
  }

  async uploadTeacherDocument(
    actor: AuthenticatedUser,
    schoolId: string,
    teacherId: string,
    file: Express.Multer.File,
    label?: string,
  ) {
    await this.schools.findOneAccessibleOrThrow(actor, schoolId);
    const teacher = await this.prisma.teacher.findFirst({ where: { id: teacherId, schoolId } });
    if (!teacher) throw new NotFoundException("Teacher not found in this school");
    return this.storeTeacherDocument(actor, schoolId, teacherId, file, label);
  }

  async listTeacherDocuments(actor: AuthenticatedUser, schoolId: string, teacherId: string) {
    await this.schools.findOneAccessibleOrThrow(actor, schoolId);
    const teacher = await this.prisma.teacher.findFirst({ where: { id: teacherId, schoolId } });
    if (!teacher) throw new NotFoundException("Teacher not found in this school");
    return this.listDocuments("TEACHER", teacherId);
  }

  // Owner-agnostic photo lookup that never throws — for embedding a photo
  // URL inline while listing many owners at once (e.g. a class roster),
  // where a 404 for "no photo yet" is expected, not exceptional.
  async tryGetPhotoUrl(ownerType: "STUDENT" | "TEACHER" | "SCHOOL", ownerId: string): Promise<string | null> {
    const latest = await this.prisma.mediaFile.findFirst({
      where: { ownerType, ownerId, kind: "PHOTO" },
      orderBy: { createdAt: "desc" },
    });
    if (!latest) return null;
    return this.storage.getSignedDownloadUrl(latest.storageKey);
  }

  async uploadSchoolLogo(actor: AuthenticatedUser, schoolId: string, file: Express.Multer.File) {
    const school = await this.schools.findOneAccessibleOrThrow(actor, schoolId);
    this.assertValidImage(file);
    const extension = file.mimetype.split("/")[1];
    const storageKey = `schools/${schoolId}/${randomUUID()}.${extension}`;
    await this.storage.upload(storageKey, file.buffer, file.mimetype);

    return this.prisma.mediaFile.create({
      data: {
        organizationId: school.organizationId,
        schoolId,
        ownerType: "SCHOOL",
        ownerId: schoolId,
        kind: "PHOTO",
        storageKey,
        mimeType: file.mimetype,
        sizeBytes: file.size,
        uploadedByUserId: actor.id,
      },
    });
  }

  // Doesn't delete the Cloudinary asset or prior MediaFile rows — same
  // Mirrors StudentsService/TeachersService's own delete cleanup: the
  // MediaFile rows AND their underlying Cloudinary assets both go, so
  // removing a logo doesn't leave an orphaned upload behind. Ownership is
  // re-checked here even though the controller already required
  // settings.manage, since that permission alone doesn't prove *this*
  // school is one the actor is allowed to touch.
  async removeSchoolLogo(actor: AuthenticatedUser, schoolId: string) {
    await this.schools.findOneAccessibleOrThrow(actor, schoolId);
    const files = await this.prisma.mediaFile.findMany({
      where: { ownerType: "SCHOOL", ownerId: schoolId, kind: "PHOTO" },
    });
    await this.prisma.mediaFile.deleteMany({ where: { ownerType: "SCHOOL", ownerId: schoolId, kind: "PHOTO" } });
    await Promise.all(files.map((f) => this.storage.delete(f.storageKey, f.mimeType).catch(() => undefined)));
    return { success: true };
  }

  // Batch variant of tryGetPhotoUrl for the /auth/me payload, which resolves
  // every school a user belongs to at once — avoids an N+1 query per school.
  async getSchoolLogoUrls(schoolIds: string[]): Promise<Record<string, string>> {
    if (schoolIds.length === 0) return {};
    const rows = await this.prisma.mediaFile.findMany({
      where: { ownerType: "SCHOOL", ownerId: { in: schoolIds }, kind: "PHOTO" },
      orderBy: { createdAt: "desc" },
    });
    const result: Record<string, string> = {};
    for (const row of rows) {
      if (!(row.ownerId in result)) {
        result[row.ownerId] = await this.storage.getSignedDownloadUrl(row.storageKey);
      }
    }
    return result;
  }

  private async getSelfTeacherOrThrow(actor: AuthenticatedUser) {
    const teacher = await this.prisma.teacher.findFirst({ where: { userId: actor.id } });
    if (!teacher) throw new NotFoundException("No teacher profile linked to this account");
    return teacher;
  }

  private async storeTeacherPhoto(actor: AuthenticatedUser, schoolId: string, teacherId: string, file: Express.Multer.File) {
    const school = await this.schools.findOneAccessibleOrThrow(actor, schoolId);
    this.assertValidImage(file);
    const extension = file.mimetype.split("/")[1];
    const storageKey = `teachers/${teacherId}/${randomUUID()}.${extension}`;
    await this.storage.upload(storageKey, file.buffer, file.mimetype);

    return this.prisma.mediaFile.create({
      data: {
        organizationId: school.organizationId,
        schoolId,
        ownerType: "TEACHER",
        ownerId: teacherId,
        kind: "PHOTO",
        storageKey,
        mimeType: file.mimetype,
        sizeBytes: file.size,
        uploadedByUserId: actor.id,
      },
    });
  }

  private async storeTeacherDocument(
    actor: AuthenticatedUser,
    schoolId: string,
    teacherId: string,
    file: Express.Multer.File,
    label?: string,
  ) {
    const school = await this.schools.findOneAccessibleOrThrow(actor, schoolId);
    this.assertValidDocument(file);
    const extension = file.mimetype.split("/")[1];
    const storageKey = `teachers/${teacherId}/documents/${randomUUID()}.${extension}`;
    await this.storage.upload(storageKey, file.buffer, file.mimetype);

    return this.prisma.mediaFile.create({
      data: {
        organizationId: school.organizationId,
        schoolId,
        ownerType: "TEACHER",
        ownerId: teacherId,
        kind: "DOCUMENT",
        label: label || null,
        storageKey,
        mimeType: file.mimetype,
        sizeBytes: file.size,
        uploadedByUserId: actor.id,
      },
    });
  }

  private async listDocuments(ownerType: "STUDENT" | "TEACHER", ownerId: string) {
    const rows = await this.prisma.mediaFile.findMany({
      where: { ownerType, ownerId, kind: "DOCUMENT" },
      orderBy: { createdAt: "desc" },
    });
    return Promise.all(
      rows.map(async (row) => ({
        id: row.id,
        label: row.label,
        mimeType: row.mimeType,
        sizeBytes: row.sizeBytes,
        uploadedAt: row.createdAt,
        url: await this.storage.getSignedDownloadUrl(row.storageKey, row.mimeType),
      })),
    );
  }

  private assertValidImage(file: Express.Multer.File) {
    if (!file) throw new BadRequestException("No file uploaded");
    if (!ALLOWED_IMAGE_TYPES.has(file.mimetype)) {
      throw new BadRequestException("Only JPEG, PNG, or WebP images are allowed");
    }
    if (file.size > MAX_SIZE_BYTES) {
      throw new BadRequestException("File exceeds the 5MB limit");
    }
  }

  private assertValidDocument(file: Express.Multer.File) {
    if (!file) throw new BadRequestException("No file uploaded");
    if (!ALLOWED_DOCUMENT_TYPES.has(file.mimetype)) {
      throw new BadRequestException("Only JPEG, PNG, WebP, or PDF files are allowed");
    }
    if (file.size > MAX_DOCUMENT_SIZE_BYTES) {
      throw new BadRequestException("File exceeds the 10MB limit");
    }
  }

  private async getPhotoUrl(ownerType: "STUDENT" | "TEACHER", ownerId: string) {
    const latest = await this.prisma.mediaFile.findFirst({
      where: { ownerType, ownerId, kind: "PHOTO" },
      orderBy: { createdAt: "desc" },
    });
    if (!latest) throw new NotFoundException("No photo uploaded yet");

    const url = await this.storage.getSignedDownloadUrl(latest.storageKey);
    return { url, uploadedAt: latest.createdAt };
  }
}
