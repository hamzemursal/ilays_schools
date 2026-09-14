import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { randomBytes, createHash } from "node:crypto";
import type { Prisma } from "@school-erp/database";
import { PrismaService } from "../prisma/prisma.service";
import { SchoolsService } from "../schools/schools.service";
import { AuditService } from "../audit/audit.service";
import { AuditAction, AuditModuleName } from "../audit/audit-actions";
import type { AuthenticatedUser } from "../auth/types/authenticated-user";
import { GuardianInputDto } from "./dto/guardian-input.dto";
import { CreateGuardianDto } from "./dto/create-guardian.dto";
import { UpdateGuardianDto } from "./dto/update-guardian.dto";
import { LinkChildDto } from "./dto/link-child.dto";
import { CreatePortalAccountDto } from "./dto/create-portal-account.dto";

type Tx = Prisma.TransactionClient;

const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

const CHILD_INCLUDE = {
  student: true,
} as const;

@Injectable()
export class GuardiansService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly schools: SchoolsService,
    private readonly audit: AuditService,
  ) {}

  // Resolves a guardian for a student link: an explicit existingGuardianId
  // (the admin picked one from search) always wins; otherwise reuses an
  // existing guardian when phone or email matches — this is what keeps "one
  // parent, many children" true instead of creating a new Guardian row every
  // time the same parent is added to another child. Exact-match only, never
  // fuzzy — unlike student duplicate detection, there's no ambiguity worth
  // flagging for human review here.
  //
  // organizationId is checked even for existingGuardianId: the admin-facing
  // search this id normally comes from (searchForSchool) is already scoped
  // to this org/school, but this endpoint has no schoolId route param to
  // re-derive that scope from, so this is the backend's own independent
  // check — never trust that a client only ever sends ids it was shown.
  // A guardian with zero relationships yet (freshly created via the
  // Parents page, not linked to anyone) is allowed through, same as
  // assertAccessibleGuardian's own definition of "accessible".
  async findOrCreate(tx: Tx, organizationId: string, input: GuardianInputDto) {
    if (input.existingGuardianId) {
      const existing = await tx.guardian.findUnique({
        where: { id: input.existingGuardianId },
        include: { students: { select: { student: { select: { organizationId: true } } } } },
      });
      if (!existing) throw new NotFoundException("Selected guardian no longer exists");
      const accessible = existing.students.length === 0 || existing.students.some((sg) => sg.student.organizationId === organizationId);
      if (!accessible) throw new NotFoundException("Selected guardian no longer exists");
      // Strip the `students` relation used only for the check above — the
      // returned shape should stay a plain Guardian record, matching every
      // other branch of this function and what callers already expect.
      const { students: _students, ...guardian } = existing;
      return guardian;
    }
    if (input.phone) {
      const existing = await tx.guardian.findFirst({ where: { phone: input.phone } });
      if (existing) return existing;
    }
    if (input.email) {
      const existing = await tx.guardian.findFirst({ where: { email: input.email } });
      if (existing) return existing;
    }
    return tx.guardian.create({
      data: {
        guardianCode: await this.generateGuardianCode(tx),
        firstName: input.firstName,
        lastName: input.lastName,
        phone: input.phone,
        email: input.email,
      },
    });
  }

  async linkToStudent(
    tx: Tx,
    studentId: string,
    guardianId: string,
    relationship: GuardianInputDto["relationship"],
    isPrimaryContact?: boolean,
  ) {
    return tx.studentGuardian.upsert({
      where: { studentId_guardianId: { studentId, guardianId } },
      update: { relationship, isPrimaryContact, status: "ACTIVE" },
      create: { studentId, guardianId, relationship, isPrimaryContact: isPrimaryContact ?? false },
    });
  }

  // A guardian isn't itself tied to any one school (StudentGuardian carries
  // no schoolId — unlike Invoice/Attendance, which belong to one specific
  // enrollment), so it can't be scoped the same way those are. Instead: a
  // school-scoped actor only sees this student's guardians while the
  // student has a CURRENTLY active enrollment at one of that actor's own
  // schools. Without this, a school the student transferred away from years
  // ago — which assertAccessibleStudent still lets view the profile at all,
  // for legitimate transfer-history reasons — would otherwise go on seeing
  // the family's current contact details forever, including ones only ever
  // given to the student's new school. An org-wide actor (empty schoolIds)
  // is unaffected, same as everywhere else this pattern appears.
  async listForStudent(actor: AuthenticatedUser, studentId: string) {
    if (actor.schoolIds.length > 0) {
      const hasCurrentEnrollment = await this.prisma.studentEnrollment.findFirst({
        where: { studentId, status: "ACTIVE", schoolId: { in: actor.schoolIds } },
        select: { id: true },
      });
      if (!hasCurrentEnrollment) return [];
    }

    const links = await this.prisma.studentGuardian.findMany({
      where: { studentId, status: "ACTIVE" },
      include: { guardian: true },
    });
    return links.map((l) => ({ ...l.guardian, relationship: l.relationship, isPrimaryContact: l.isPrimaryContact }));
  }

  // Backs the "search for an existing guardian" step both in student
  // creation and when linking a guardian to an already-existing student —
  // scoped to guardians already linked to a student enrolled in this school,
  // so an admin can find "Ahmed Hassan" (parent of an existing student) and
  // reuse that exact record instead of retyping his details.
  async searchForSchool(organizationId: string, schoolId: string, query: string) {
    if (query.trim().length < 2) return [];
    const guardians = await this.prisma.guardian.findMany({
      where: {
        status: "ACTIVE",
        students: {
          some: { student: { organizationId, enrollments: { some: { schoolId } } } },
        },
        OR: [
          { firstName: { contains: query, mode: "insensitive" } },
          { lastName: { contains: query, mode: "insensitive" } },
          { phone: { contains: query } },
          { email: { contains: query, mode: "insensitive" } },
        ],
      },
      include: {
        // ACTIVE links to a student currently enrolled in THIS school — the
        // same scope toListView already uses for its own "children" count,
        // so this number means the same thing everywhere it's shown.
        students: { where: { status: "ACTIVE", student: { enrollments: { some: { schoolId } } } }, select: { studentId: true } },
      },
      take: 10,
      orderBy: { lastName: "asc" },
    });
    return guardians.map((g) => ({
      id: g.id,
      firstName: g.firstName,
      lastName: g.lastName,
      phone: g.phone,
      email: g.email,
      linkedStudentCount: g.students.length,
    }));
  }

  // Every parent-management endpoint below is scoped to "guardians this
  // school can see" — any guardian linked (ever, active or not) to a student
  // enrolled at schoolId, plus brand-new guardians with zero relationships
  // yet (the "create parent, then add children" two-step flow from the
  // Parents page). This is also the school-isolation boundary: a guardian
  // whose only children are at another school is invisible here.
  private async assertAccessibleGuardian(schoolId: string, guardianId: string) {
    const guardian = await this.prisma.guardian.findFirst({
      where: {
        id: guardianId,
        OR: [
          { students: { none: {} } },
          { students: { some: { student: { enrollments: { some: { schoolId } } } } } },
        ],
      },
    });
    if (!guardian) throw new NotFoundException("Parent not found in this school");
    return guardian;
  }

  async list(actor: AuthenticatedUser, schoolId: string) {
    await this.schools.findOneAccessibleOrThrow(actor, schoolId);

    const guardians = await this.prisma.guardian.findMany({
      where: { students: { some: { student: { enrollments: { some: { schoolId } } } } } },
      include: {
        user: { select: { id: true, email: true, status: true } },
        students: {
          include: {
            student: {
              include: {
                enrollments: {
                  where: { status: "ACTIVE" },
                  include: { class: true, section: true, academicYear: true, school: true },
                  orderBy: { startDate: "desc" },
                  take: 1,
                },
              },
            },
          },
        },
      },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    });

    return guardians.map((g) => this.toListView(g, schoolId));
  }

  async getOne(actor: AuthenticatedUser, schoolId: string, guardianId: string) {
    await this.schools.findOneAccessibleOrThrow(actor, schoolId);
    await this.assertAccessibleGuardian(schoolId, guardianId);

    const guardian = await this.prisma.guardian.findUniqueOrThrow({
      where: { id: guardianId },
      include: {
        user: { select: { id: true, email: true, status: true } },
        students: {
          include: {
            student: {
              include: {
                enrollments: {
                  include: { class: true, section: true, academicYear: true, school: true },
                  orderBy: { startDate: "desc" },
                },
              },
            },
          },
        },
      },
    });

    return guardian;
  }

  // Duplicate check mirrors StudentsService.create: exact phone/email match
  // surfaces as a possible duplicate for the admin to confirm past, rather
  // than silently creating a second record for the same real parent.
  async create(actor: AuthenticatedUser, schoolId: string, dto: CreateGuardianDto) {
    await this.schools.findOneAccessibleOrThrow(actor, schoolId);

    if (!dto.confirmDespiteDuplicates && (dto.phone || dto.email)) {
      const candidates = await this.prisma.guardian.findMany({
        where: {
          OR: [
            ...(dto.phone ? [{ phone: dto.phone }] : []),
            ...(dto.email ? [{ email: dto.email }] : []),
          ],
        },
        take: 5,
      });
      if (candidates.length > 0) {
        throw new ConflictException({
          message: "Possible duplicate parent(s) found — review before creating",
          possibleDuplicates: candidates,
        });
      }
    }

    return this.prisma.guardian.create({
      data: {
        guardianCode: await this.generateGuardianCode(this.prisma),
        firstName: dto.firstName,
        lastName: dto.lastName,
        phone: dto.phone,
        email: dto.email,
        address: dto.address,
      },
    });
  }

  async update(actor: AuthenticatedUser, schoolId: string, guardianId: string, dto: UpdateGuardianDto) {
    await this.schools.findOneAccessibleOrThrow(actor, schoolId);
    const guardian = await this.assertAccessibleGuardian(schoolId, guardianId);

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.guardian.update({
        where: { id: guardianId },
        data: {
          firstName: dto.firstName,
          lastName: dto.lastName,
          phone: dto.phone,
          email: dto.email,
          address: dto.address,
          status: dto.status,
        },
      });

      // Archiving a parent also revokes portal access — never the reverse,
      // so restoring access after an archive is always a deliberate,
      // separate action (see createPortalAccount).
      if (dto.status === "ARCHIVED" && guardian.userId) {
        await tx.user.update({ where: { id: guardian.userId }, data: { status: "SUSPENDED" } });
      }

      return updated;
    });
  }

  // A student can only be linked to a guardian that belongs to this school —
  // same section-ownership check used throughout enrollment-adjacent flows.
  // Genuine permanent deletion. StudentGuardian and Notification rows
  // cascade automatically once the Guardian row is deleted — the only manual
  // cleanup needed is the linked portal login account, if any (User is a
  // separate aggregate; Guardian.userId is SetNull, not the deleting side).
  async remove(actor: AuthenticatedUser, schoolId: string, guardianId: string) {
    await this.schools.findOneAccessibleOrThrow(actor, schoolId);
    const guardian = await this.assertAccessibleGuardian(schoolId, guardianId);

    await this.prisma.$transaction(async (tx) => {
      await tx.guardian.delete({ where: { id: guardianId } });

      if (guardian.userId) {
        await tx.user.delete({ where: { id: guardian.userId } });
      }

      await this.audit.record(
        {
          actor,
          organizationId: actor.organizationId,
          schoolId,
          action: AuditAction.PARENT_DELETED,
          module: AuditModuleName.PARENTS,
          resourceType: "Guardian",
          resourceId: guardianId,
          resourceName: `${guardian.firstName} ${guardian.lastName}`,
          severity: "WARNING",
          before: { firstName: guardian.firstName, lastName: guardian.lastName, guardianCode: guardian.guardianCode },
        },
        tx,
      );
    }, { timeout: 30_000 });

    return { success: true };
  }

  async addChild(actor: AuthenticatedUser, schoolId: string, guardianId: string, dto: LinkChildDto) {
    await this.schools.findOneAccessibleOrThrow(actor, schoolId);
    await this.assertAccessibleGuardian(schoolId, guardianId);

    const student = await this.prisma.student.findFirst({
      where: { id: dto.studentId, enrollments: { some: { schoolId } } },
    });
    if (!student) throw new BadRequestException("That student does not belong to this school");

    return this.linkToStudent(this.prisma, dto.studentId, guardianId, dto.relationship, dto.isPrimaryContact);
  }

  // Soft removal — the relationship is marked INACTIVE, never deleted, so
  // historical "who was this student's guardian in 2027" queries stay
  // answerable even after an admin removes the link.
  async removeChild(actor: AuthenticatedUser, schoolId: string, guardianId: string, studentId: string) {
    await this.schools.findOneAccessibleOrThrow(actor, schoolId);
    await this.assertAccessibleGuardian(schoolId, guardianId);

    const link = await this.prisma.studentGuardian.findUnique({
      where: { studentId_guardianId: { studentId, guardianId } },
    });
    if (!link) throw new NotFoundException("This parent is not linked to that student");

    return this.prisma.studentGuardian.update({
      where: { studentId_guardianId: { studentId, guardianId } },
      data: { status: "INACTIVE" },
    });
  }

  // Grants an existing Guardian a portal login — same shape as
  // TeachersService.inviteLogin: find-or-create the User, assign the PARENT
  // role, link it back to the Guardian, add a UserSchool row for this
  // school's context, and issue an accept-invite token.
  async createPortalAccount(
    actor: AuthenticatedUser,
    schoolId: string,
    guardianId: string,
    dto: CreatePortalAccountDto,
  ) {
    const school = await this.schools.findOneAccessibleOrThrow(actor, schoolId);
    const guardian = await this.assertAccessibleGuardian(schoolId, guardianId);
    if (guardian.userId) throw new ConflictException("This parent already has a portal account");

    const targetEmail = dto.email ?? guardian.email;
    if (!targetEmail) {
      throw new BadRequestException("This parent has no email on file — provide one to send the invite");
    }

    const existingUser = await this.prisma.user.findUnique({ where: { email: targetEmail } });
    if (existingUser?.status === "ACTIVE") {
      throw new ConflictException("A user with this email already has an active account");
    }

    const role = await this.prisma.role.findUniqueOrThrow({ where: { name: "PARENT" } });
    const rawToken = randomBytes(32).toString("hex");

    await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.upsert({
        where: { email: targetEmail },
        update: {},
        create: { email: targetEmail, organizationId: school.organizationId, status: "PENDING_SETUP" },
      });

      await tx.guardian.update({ where: { id: guardian.id }, data: { userId: user.id, email: targetEmail } });

      await tx.userRole.upsert({
        where: { userId_roleId: { userId: user.id, roleId: role.id } },
        update: {},
        create: { userId: user.id, roleId: role.id },
      });

      await tx.userSchool.upsert({
        where: { userId_schoolId: { userId: user.id, schoolId } },
        update: {},
        create: { userId: user.id, schoolId },
      });

      await tx.invitation.create({
        data: {
          organizationId: school.organizationId,
          schoolId,
          roleId: role.id,
          userId: user.id,
          invitedByUserId: actor.id,
          tokenHash: hashToken(rawToken),
          expiresAt: new Date(Date.now() + INVITATION_TTL_MS),
        },
      });

      await this.audit.record(
        {
          actor,
          organizationId: school.organizationId,
          schoolId,
          action: AuditAction.PARENT_LOGIN_INVITED,
          module: AuditModuleName.PARENTS,
          resourceType: "Guardian",
          resourceId: guardian.id,
          resourceName: `${guardian.firstName} ${guardian.lastName}`,
          after: { email: targetEmail },
        },
        tx,
      );
    }, { timeout: 30_000 });

    const webOrigin = process.env.WEB_ORIGIN ?? "http://localhost:3010";
    return { email: targetEmail, acceptUrl: `${webOrigin}/accept-invite?token=${rawToken}` };
  }

  // Confirms this guardian is allowed to see this student, for every
  // parent-portal read (attendance, results, invoices, subjects, photo).
  // The chain is exactly User -> Guardian -> StudentGuardian -> Student —
  // school isolation falls out of this for free, since a guardian can only
  // ever be linked to students an admin explicitly linked them to.
  async assertGuardianCanAccessStudent(actor: AuthenticatedUser, studentId: string) {
    const guardian = await this.prisma.guardian.findFirst({ where: { userId: actor.id } });
    if (!guardian) throw new NotFoundException("No parent profile linked to this account");

    const link = await this.prisma.studentGuardian.findFirst({
      where: { guardianId: guardian.id, studentId, status: "ACTIVE" },
    });
    if (!link) throw new NotFoundException("Student not found");

    return { guardian, link };
  }

  async getSelfGuardianOrThrow(actor: AuthenticatedUser) {
    const guardian = await this.prisma.guardian.findFirst({ where: { userId: actor.id } });
    if (!guardian) throw new NotFoundException("No parent profile linked to this account");
    return guardian;
  }

  private async generateGuardianCode(tx: Tx | PrismaService): Promise<string> {
    const count = await tx.guardian.count();
    return `PAR-${String(count + 1).padStart(5, "0")}`;
  }

  private toListView(
    guardian: Prisma.GuardianGetPayload<{
      include: {
        user: { select: { id: true; email: true; status: true } };
        students: {
          include: {
            student: {
              include: {
                enrollments: {
                  include: { class: true; section: true; academicYear: true; school: true };
                };
              };
            };
          };
        };
      };
    }>,
    schoolId: string,
  ) {
    // ACTIVE only — a removed relationship shouldn't inflate the "how many
    // children does this parent currently have here" count on the list.
    const childrenInThisSchool = guardian.students.filter(
      (sg) => sg.status === "ACTIVE" && sg.student.enrollments.some((e) => e.schoolId === schoolId),
    );
    return {
      id: guardian.id,
      guardianCode: guardian.guardianCode,
      firstName: guardian.firstName,
      lastName: guardian.lastName,
      phone: guardian.phone,
      email: guardian.email,
      address: guardian.address,
      status: guardian.status,
      hasPortalAccount: !!guardian.user,
      portalAccountStatus: guardian.user?.status ?? null,
      children: childrenInThisSchool.map((sg) => ({
        studentId: sg.studentId,
        firstName: sg.student.firstName,
        lastName: sg.student.lastName,
        relationship: sg.relationship,
        isPrimaryContact: sg.isPrimaryContact,
        status: sg.status,
        enrollment: sg.student.enrollments[0]
          ? {
              className: sg.student.enrollments[0].class.name,
              sectionName: sg.student.enrollments[0].section.name,
              academicYearName: sg.student.enrollments[0].academicYear.name,
            }
          : null,
      })),
    };
  }
}
