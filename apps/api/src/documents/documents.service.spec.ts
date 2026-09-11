import { BadRequestException, NotFoundException } from "@nestjs/common";
import type { AuthenticatedUser } from "../auth/types/authenticated-user";
import { DocumentsService } from "./documents.service";
import { PrismaService } from "../prisma/prisma.service";
import { StorageService } from "../storage/storage.service";
import { StudentsService } from "../students/students.service";
import { SchoolsService } from "../schools/schools.service";
import { GuardiansService } from "../guardians/guardians.service";
import { AuditService } from "../audit/audit.service";

const ACTOR: AuthenticatedUser = {
  id: "admin-1",
  email: "admin@example.com",
  organizationId: "org-1",
  roles: ["SCHOOL_ADMIN"],
  permissions: ["documents.manage"],
  schoolIds: ["school-1"],
};

type MockPrisma = {
  mediaFile: { create: jest.Mock; findFirst: jest.Mock; findMany: jest.Mock; deleteMany: jest.Mock };
  teacher: { findFirst: jest.Mock };
};

function createMockPrisma(): MockPrisma {
  return {
    mediaFile: { create: jest.fn(), findFirst: jest.fn(), findMany: jest.fn(), deleteMany: jest.fn() },
    teacher: { findFirst: jest.fn() },
  };
}

function createService(prisma: MockPrisma) {
  const storage = {
    upload: jest.fn().mockResolvedValue(undefined),
    uploadPrivate: jest.fn().mockResolvedValue(undefined),
    delete: jest.fn().mockResolvedValue(undefined),
    getSignedDownloadUrl: jest.fn().mockResolvedValue("https://cdn.example.com/signed"),
    getPrivateDownloadUrl: jest.fn().mockResolvedValue("https://cdn.example.com/private-signed"),
  };
  const students = { assertAccessibleStudent: jest.fn().mockResolvedValue({ id: "student-1", organizationId: "org-1" }) };
  const schools = { findOneAccessibleOrThrow: jest.fn().mockResolvedValue({ id: "school-1", organizationId: "org-1", name: "Ilays" }) };
  const guardians = { assertGuardianCanAccessStudent: jest.fn().mockResolvedValue(undefined) };
  const audit = { record: jest.fn().mockResolvedValue(undefined) };
  const service = new DocumentsService(
    prisma as unknown as PrismaService,
    storage as unknown as StorageService,
    students as unknown as StudentsService,
    schools as unknown as SchoolsService,
    guardians as unknown as GuardiansService,
    audit as unknown as AuditService,
  );
  return { service, storage, students, schools, guardians, audit };
}

function imageFile(overrides: Partial<Express.Multer.File> = {}): Express.Multer.File {
  return {
    mimetype: "image/png",
    size: 1024,
    buffer: Buffer.from("fake"),
    originalname: "photo.png",
    ...overrides,
  } as Express.Multer.File;
}

describe("DocumentsService — image validation (assertValidImage)", () => {
  let prisma: MockPrisma;
  let service: DocumentsService;

  beforeEach(() => {
    prisma = createMockPrisma();
    ({ service } = createService(prisma));
    prisma.mediaFile.create.mockResolvedValue({ id: "mf-1" });
  });

  it("rejects a missing file", async () => {
    await expect(service.uploadStudentPhoto(ACTOR, "student-1", undefined as unknown as Express.Multer.File)).rejects.toThrow(
      "No file uploaded",
    );
  });

  it("rejects a disallowed mime type", async () => {
    await expect(service.uploadStudentPhoto(ACTOR, "student-1", imageFile({ mimetype: "application/pdf" }))).rejects.toThrow(
      "Only JPEG, PNG, or WebP images are allowed",
    );
  });

  it("rejects a file over the 5MB image limit", async () => {
    await expect(
      service.uploadStudentPhoto(ACTOR, "student-1", imageFile({ size: 5 * 1024 * 1024 + 1 })),
    ).rejects.toThrow("File exceeds the 5MB limit");
  });

  it("accepts a valid image right at the 5MB limit", async () => {
    await expect(service.uploadStudentPhoto(ACTOR, "student-1", imageFile({ size: 5 * 1024 * 1024 }))).resolves.toBeDefined();
  });
});

describe("DocumentsService — document validation (assertValidDocument)", () => {
  let prisma: MockPrisma;
  let service: DocumentsService;
  let students: { assertAccessibleStudent: jest.Mock };

  beforeEach(() => {
    prisma = createMockPrisma();
    ({ service, students } = createService(prisma));
    prisma.teacher.findFirst.mockResolvedValue({ id: "teacher-1", schoolId: "school-1" });
    prisma.mediaFile.create.mockResolvedValue({ id: "mf-1" });
  });

  it("allows DOCX in addition to images and PDF", async () => {
    await expect(
      service.uploadTeacherDocument(
        ACTOR,
        "school-1",
        "teacher-1",
        imageFile({ mimetype: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }),
      ),
    ).resolves.toBeDefined();
  });

  it("rejects a document over the 10MB limit even though it's under the 5MB image limit check", async () => {
    await expect(
      service.uploadTeacherDocument(ACTOR, "school-1", "teacher-1", imageFile({ mimetype: "application/pdf", size: 10 * 1024 * 1024 + 1 })),
    ).rejects.toThrow("File exceeds the 10MB limit");
  });

  it("rejects an unsupported mime type", async () => {
    await expect(
      service.uploadTeacherDocument(ACTOR, "school-1", "teacher-1", imageFile({ mimetype: "video/mp4" })),
    ).rejects.toThrow("Only JPEG, PNG, WebP, PDF, DOC, or DOCX files are allowed");
  });
});

describe("DocumentsService — storageKey extension derivation", () => {
  let prisma: MockPrisma;
  let service: DocumentsService;
  let storage: { upload: jest.Mock };

  beforeEach(() => {
    prisma = createMockPrisma();
    ({ service, storage } = createService(prisma));
    prisma.mediaFile.create.mockResolvedValue({ id: "mf-1" });
  });

  it("maps DOCX's structured mimetype to a real '.docx' extension, not a raw subtype dump", async () => {
    prisma.teacher.findFirst.mockResolvedValue({ id: "teacher-1", schoolId: "school-1" });
    await service.uploadTeacherDocument(
      ACTOR,
      "school-1",
      "teacher-1",
      imageFile({ mimetype: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }),
    );
    const [storageKey] = storage.upload.mock.calls[0];
    expect(storageKey).toMatch(/\.docx$/);
  });

  it("maps a plain image mimetype straight through (png)", async () => {
    await service.uploadStudentPhoto(ACTOR, "student-1", imageFile({ mimetype: "image/png" }));
    const [storageKey] = storage.upload.mock.calls[0];
    expect(storageKey).toMatch(/\.png$/);
  });
});

describe("DocumentsService.uploadStudentPhoto / getStudentPhotoUrl / getChildPhotoUrl", () => {
  let prisma: MockPrisma;
  let service: DocumentsService;
  let students: { assertAccessibleStudent: jest.Mock };
  let guardians: { assertGuardianCanAccessStudent: jest.Mock };
  let storage: { upload: jest.Mock; getSignedDownloadUrl: jest.Mock };

  beforeEach(() => {
    prisma = createMockPrisma();
    ({ service, students, guardians, storage } = createService(prisma));
    prisma.mediaFile.create.mockResolvedValue({ id: "mf-1" });
  });

  it("checks staff accessibility (not guardian) for the admin upload path", async () => {
    await service.uploadStudentPhoto(ACTOR, "student-1", imageFile());
    expect(students.assertAccessibleStudent).toHaveBeenCalledWith(ACTOR, "student-1");
  });

  it("stores the photo under students/<id>/ with kind PHOTO, scoped to the student's own organizationId", async () => {
    await service.uploadStudentPhoto(ACTOR, "student-1", imageFile());
    expect(prisma.mediaFile.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ organizationId: "org-1", ownerType: "STUDENT", ownerId: "student-1", kind: "PHOTO" }),
      }),
    );
    const [storageKey] = storage.upload.mock.calls[0];
    expect(storageKey).toMatch(/^students\/student-1\//);
  });

  it("getStudentPhotoUrl throws NotFoundException when no photo has ever been uploaded", async () => {
    prisma.mediaFile.findFirst.mockResolvedValue(null);
    await expect(service.getStudentPhotoUrl(ACTOR, "student-1")).rejects.toThrow(NotFoundException);
  });

  it("getStudentPhotoUrl returns the signed URL and uploadedAt for the latest photo", async () => {
    prisma.mediaFile.findFirst.mockResolvedValue({ storageKey: "students/student-1/x.png", createdAt: new Date("2028-01-01") });
    const result = await service.getStudentPhotoUrl(ACTOR, "student-1");
    expect(result).toEqual({ url: "https://cdn.example.com/signed", uploadedAt: new Date("2028-01-01") });
  });

  it("getChildPhotoUrl checks guardian-child access, not staff accessibility", async () => {
    prisma.mediaFile.findFirst.mockResolvedValue(null);
    await expect(service.getChildPhotoUrl(ACTOR, "student-1")).rejects.toThrow(NotFoundException);
    expect(guardians.assertGuardianCanAccessStudent).toHaveBeenCalledWith(ACTOR, "student-1");
    expect(students.assertAccessibleStudent).not.toHaveBeenCalled();
  });
});

describe("DocumentsService — teacher photo/document paths (admin vs self-service)", () => {
  let prisma: MockPrisma;
  let service: DocumentsService;

  beforeEach(() => {
    prisma = createMockPrisma();
    ({ service } = createService(prisma));
    prisma.mediaFile.create.mockResolvedValue({ id: "mf-1" });
  });

  it("uploadTeacherPhoto throws NotFoundException for a teacher not in this school", async () => {
    prisma.teacher.findFirst.mockResolvedValue(null);
    await expect(service.uploadTeacherPhoto(ACTOR, "school-1", "teacher-1", imageFile())).rejects.toThrow(NotFoundException);
  });

  it("uploadMyPhoto resolves the teacher id server-side from the actor's own linked Teacher profile", async () => {
    prisma.teacher.findFirst.mockResolvedValue({ id: "self-teacher-1", schoolId: "school-1", userId: "admin-1" });
    await service.uploadMyPhoto(ACTOR, imageFile());
    expect(prisma.teacher.findFirst).toHaveBeenCalledWith({ where: { userId: "admin-1" } });
    expect(prisma.mediaFile.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ ownerId: "self-teacher-1" }) }),
    );
  });

  it("uploadMyPhoto throws NotFoundException when the actor has no linked Teacher profile", async () => {
    prisma.teacher.findFirst.mockResolvedValue(null);
    await expect(service.uploadMyPhoto(ACTOR, imageFile())).rejects.toThrow("No teacher profile linked to this account");
  });

  it("uploadTeacherDocument stores kind DOCUMENT with the given label, under teachers/<id>/documents/", async () => {
    prisma.teacher.findFirst.mockResolvedValue({ id: "teacher-1", schoolId: "school-1" });
    const { storage } = createService(prisma);
    const svc = service;
    await svc.uploadTeacherDocument(ACTOR, "school-1", "teacher-1", imageFile({ mimetype: "application/pdf" }), "CV");
    expect(prisma.mediaFile.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ kind: "DOCUMENT", label: "CV" }) }),
    );
  });

  it("uploadTeacherDocument stores a null label when none is given, not an empty string", async () => {
    prisma.teacher.findFirst.mockResolvedValue({ id: "teacher-1", schoolId: "school-1" });
    await service.uploadTeacherDocument(ACTOR, "school-1", "teacher-1", imageFile({ mimetype: "application/pdf" }));
    expect(prisma.mediaFile.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ label: null }) }),
    );
  });

  it("listTeacherDocuments throws NotFoundException for a teacher not in this school", async () => {
    prisma.teacher.findFirst.mockResolvedValue(null);
    await expect(service.listTeacherDocuments(ACTOR, "school-1", "teacher-1")).rejects.toThrow(NotFoundException);
  });

  it("listMyDocuments/listTeacherDocuments map each MediaFile row to id/label/mimeType/sizeBytes/uploadedAt/url", async () => {
    prisma.teacher.findFirst.mockResolvedValue({ id: "teacher-1", schoolId: "school-1", userId: "admin-1" });
    prisma.mediaFile.findMany.mockResolvedValue([
      { id: "doc-1", label: "CV", mimeType: "application/pdf", sizeBytes: 500, createdAt: new Date("2028-01-01"), storageKey: "k1" },
    ]);
    const result = await service.listMyDocuments(ACTOR);
    expect(result).toEqual([
      { id: "doc-1", label: "CV", mimeType: "application/pdf", sizeBytes: 500, uploadedAt: new Date("2028-01-01"), url: "https://cdn.example.com/signed" },
    ]);
  });
});

describe("DocumentsService — School logo (upload/remove/audit)", () => {
  let prisma: MockPrisma;
  let service: DocumentsService;
  let audit: { record: jest.Mock };
  let storage: { delete: jest.Mock };

  beforeEach(() => {
    prisma = createMockPrisma();
    ({ service, audit, storage } = createService(prisma));
    prisma.mediaFile.create.mockResolvedValue({ id: "mf-1" });
  });

  it("uploadSchoolLogo records a SCHOOL_LOGO_CHANGED audit entry", async () => {
    await service.uploadSchoolLogo(ACTOR, "school-1", imageFile());
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: "SCHOOL_LOGO_CHANGED", module: "School", resourceId: "school-1" }),
    );
  });

  it("removeSchoolLogo deletes every existing logo MediaFile row and its storage object", async () => {
    prisma.mediaFile.findMany.mockResolvedValue([
      { storageKey: "schools/school-1/old1.png", mimeType: "image/png" },
      { storageKey: "schools/school-1/old2.png", mimeType: "image/png" },
    ]);

    const result = await service.removeSchoolLogo(ACTOR, "school-1");

    expect(prisma.mediaFile.deleteMany).toHaveBeenCalledWith({ where: { ownerType: "SCHOOL", ownerId: "school-1", kind: "PHOTO" } });
    expect(storage.delete).toHaveBeenCalledTimes(2);
    expect(result).toEqual({ success: true });
  });

  it("removeSchoolLogo records an audit entry only when a logo actually existed", async () => {
    prisma.mediaFile.findMany.mockResolvedValue([]);
    const { service: freshService, audit: freshAudit } = createService(prisma);
    await freshService.removeSchoolLogo(ACTOR, "school-1");
    expect(freshAudit.record).not.toHaveBeenCalled();
  });

  it("removeSchoolLogo never lets a storage deletion failure abort the whole operation", async () => {
    prisma.mediaFile.findMany.mockResolvedValue([{ storageKey: "schools/school-1/old1.png", mimeType: "image/png" }]);
    const { service: freshService, storage: freshStorage } = createService(prisma);
    freshStorage.delete.mockRejectedValue(new Error("cloudinary down"));

    await expect(freshService.removeSchoolLogo(ACTOR, "school-1")).resolves.toEqual({ success: true });
  });
});

describe("DocumentsService.getSchoolLogoUrls — batch resolution", () => {
  let prisma: MockPrisma;
  let service: DocumentsService;
  let storage: { getSignedDownloadUrl: jest.Mock };

  beforeEach(() => {
    prisma = createMockPrisma();
    ({ service, storage } = createService(prisma));
  });

  it("returns an empty object without querying anything for an empty schoolIds list", async () => {
    const result = await service.getSchoolLogoUrls([]);
    expect(result).toEqual({});
    expect(prisma.mediaFile.findMany).not.toHaveBeenCalled();
  });

  it("resolves only the first (newest) row per school when a school has more than one logo row", async () => {
    prisma.mediaFile.findMany.mockResolvedValue([
      { ownerId: "school-1", storageKey: "newest.png" },
      { ownerId: "school-1", storageKey: "older.png" },
      { ownerId: "school-2", storageKey: "s2.png" },
    ]);

    const result = await service.getSchoolLogoUrls(["school-1", "school-2"]);

    expect(result).toEqual({ "school-1": "https://cdn.example.com/signed", "school-2": "https://cdn.example.com/signed" });
    expect(storage.getSignedDownloadUrl).toHaveBeenCalledTimes(2);
  });
});

describe("DocumentsService — result submission exam papers (private storage)", () => {
  let prisma: MockPrisma;
  let service: DocumentsService;
  let storage: { uploadPrivate: jest.Mock; upload: jest.Mock; getPrivateDownloadUrl: jest.Mock };

  beforeEach(() => {
    prisma = createMockPrisma();
    ({ service, storage } = createService(prisma));
    prisma.mediaFile.create.mockResolvedValue({ id: "mf-1" });
  });

  it("uploads via uploadPrivate, never the public upload(), since a leaked exam paper link is a real risk", async () => {
    await service.uploadResultSubmissionPaper(ACTOR, "school-1", "rs-1", imageFile({ mimetype: "application/pdf" }));
    expect(storage.uploadPrivate).toHaveBeenCalled();
    expect(storage.upload).not.toHaveBeenCalled();
  });

  it("stores ownerType RESULT_SUBMISSION with the original filename as the label", async () => {
    await service.uploadResultSubmissionPaper(ACTOR, "school-1", "rs-1", imageFile({ mimetype: "application/pdf", originalname: "paper.pdf" }));
    expect(prisma.mediaFile.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ ownerType: "RESULT_SUBMISSION", ownerId: "rs-1", label: "paper.pdf" }) }),
    );
  });

  it("getResultSubmissionPaper returns null, not a throw, when no paper has been uploaded yet", async () => {
    prisma.mediaFile.findFirst.mockResolvedValue(null);
    const result = await service.getResultSubmissionPaper("rs-1");
    expect(result).toBeNull();
  });

  it("getResultSubmissionPaper resolves via the private download URL, not the public signed one", async () => {
    prisma.mediaFile.findFirst.mockResolvedValue({
      id: "mf-1",
      label: "paper.pdf",
      mimeType: "application/pdf",
      sizeBytes: 1000,
      uploadedByUserId: "teacher-1",
      createdAt: new Date("2028-01-01"),
      storageKey: "result-submissions/rs-1/x.pdf",
    });

    const result = await service.getResultSubmissionPaper("rs-1");

    expect(storage.getPrivateDownloadUrl).toHaveBeenCalledWith("result-submissions/rs-1/x.pdf", "application/pdf");
    expect(result).toEqual({
      id: "mf-1",
      fileName: "paper.pdf",
      mimeType: "application/pdf",
      sizeBytes: 1000,
      uploadedByUserId: "teacher-1",
      uploadedAt: new Date("2028-01-01"),
      url: "https://cdn.example.com/private-signed",
    });
  });
});

describe("DocumentsService.tryGetPhotoUrl — never throws", () => {
  it("returns null instead of throwing when no photo exists for this owner", async () => {
    const prisma = createMockPrisma();
    prisma.mediaFile.findFirst.mockResolvedValue(null);
    const { service } = createService(prisma);

    const result = await service.tryGetPhotoUrl("STUDENT", "student-1");

    expect(result).toBeNull();
  });

  it("returns the signed URL when a photo exists", async () => {
    const prisma = createMockPrisma();
    prisma.mediaFile.findFirst.mockResolvedValue({ storageKey: "students/student-1/x.png" });
    const { service } = createService(prisma);

    const result = await service.tryGetPhotoUrl("STUDENT", "student-1");

    expect(result).toBe("https://cdn.example.com/signed");
  });
});
