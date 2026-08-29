import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { PrismaService } from "../prisma/prisma.service";
import { StorageService } from "../storage/storage.service";
import { StudentsService } from "../students/students.service";
import { SchoolsService } from "../schools/schools.service";
import type { AuthenticatedUser } from "../auth/types/authenticated-user";

const ALLOWED_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5MB

@Injectable()
export class DocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly students: StudentsService,
    private readonly schools: SchoolsService,
  ) {}

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
    const school = await this.schools.findOneAccessibleOrThrow(actor, schoolId);
    const teacher = await this.prisma.teacher.findFirst({ where: { id: teacherId, schoolId } });
    if (!teacher) throw new NotFoundException("Teacher not found in this school");

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
        storageKey,
        mimeType: file.mimetype,
        sizeBytes: file.size,
        uploadedByUserId: actor.id,
      },
    });
  }

  async getTeacherPhotoUrl(actor: AuthenticatedUser, schoolId: string, teacherId: string) {
    await this.schools.findOneAccessibleOrThrow(actor, schoolId);
    const teacher = await this.prisma.teacher.findFirst({ where: { id: teacherId, schoolId } });
    if (!teacher) throw new NotFoundException("Teacher not found in this school");
    return this.getPhotoUrl("TEACHER", teacherId);
  }

  private assertValidImage(file: Express.Multer.File) {
    if (!file) throw new BadRequestException("No file uploaded");
    if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
      throw new BadRequestException("Only JPEG, PNG, or WebP images are allowed");
    }
    if (file.size > MAX_SIZE_BYTES) {
      throw new BadRequestException("File exceeds the 5MB limit");
    }
  }

  private async getPhotoUrl(ownerType: "STUDENT" | "TEACHER", ownerId: string) {
    const latest = await this.prisma.mediaFile.findFirst({
      where: { ownerType, ownerId },
      orderBy: { createdAt: "desc" },
    });
    if (!latest) throw new NotFoundException("No photo uploaded yet");

    const url = await this.storage.getSignedDownloadUrl(latest.storageKey);
    return { url, uploadedAt: latest.createdAt };
  }
}
