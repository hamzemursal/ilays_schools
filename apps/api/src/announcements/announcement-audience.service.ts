import { BadRequestException, Injectable } from "@nestjs/common";
import type { AnnouncementAudience, Prisma } from "@school-erp/database";
import { PrismaService } from "../prisma/prisma.service";
import { studentAccessFor } from "../guardians/guardians.service";

type Db = PrismaService | Prisma.TransactionClient;

export interface AnnouncementScope {
  academicYearId?: string | null;
  classId?: string | null;
  sectionId?: string | null;
}

export interface AnnouncementTarget extends AnnouncementScope {
  schoolId: string;
  audience: AnnouncementAudience;
  recipientUserIds?: string[];
}

// Who an announcement reaches. A parent is keyed by guardianId (a parent's
// portal login is optional) and carries their userId when they have one, so
// the same delivery shows in both the Parent Portal and the topbar bell.
export interface Recipients {
  userIds: Set<string>;
  guardians: Map<string, string | null>;
}

// Audiences that can be narrowed to one year / class / section. Staff,
// alumni and former parents have no current class, so they stay school-wide.
export const SCOPED_AUDIENCES: AnnouncementAudience[] = ["ALL", "CURRENT_STUDENTS", "PARENTS", "TEACHERS"];

// School-level roles counted as Staff. Org-wide roles (SUPER_ADMIN,
// ORGANIZATION_ADMIN, CENTRAL_*) are not "staff of this school".
export const STAFF_ROLES = ["SCHOOL_ADMIN", "FINANCE_STAFF", "ACCOUNTANT", "HR_STAFF", "EXAM_OFFICER", "LIBRARY_STAFF"];

// The one place announcement recipients are decided. Every rule is based on
// a person's CURRENT relationship to THIS school — an ACTIVE enrollment, an
// ACTIVE parent link to an actively-enrolled child, active employment —
// never on an active login alone, and never on another school's data.
@Injectable()
export class AnnouncementAudienceService {
  constructor(private readonly prisma: PrismaService) {}

  // Rejects a scope or recipient list that doesn't fit the audience, or that
  // points outside the announcement's school (a crafted id from another
  // school is refused here, before anything is resolved).
  async validate(target: AnnouncementTarget, db: Db = this.prisma) {
    const { schoolId, audience, academicYearId, classId, sectionId, recipientUserIds } = target;
    const scoped = !!(academicYearId || classId || sectionId);

    if (audience === "INDIVIDUAL") {
      if (!recipientUserIds || recipientUserIds.length === 0) {
        throw new BadRequestException("Choose at least one person for a Specific People announcement");
      }
    } else if (recipientUserIds && recipientUserIds.length > 0) {
      throw new BadRequestException("Recipients can only be chosen for a Specific People announcement");
    }

    if (scoped && !SCOPED_AUDIENCES.includes(audience)) {
      throw new BadRequestException("This audience is school-wide and cannot be limited to a year, class or section");
    }
    if (classId && !academicYearId) throw new BadRequestException("A class needs its academic year");
    if (sectionId && !classId) throw new BadRequestException("A section needs its class");
    if (academicYearId && !classId) throw new BadRequestException("Choose a class for a year-scoped announcement");

    if (academicYearId) {
      const year = await db.academicYear.findFirst({ where: { id: academicYearId, schoolId }, select: { id: true } });
      if (!year) throw new BadRequestException("Academic year not found in this school");
    }
    if (classId) {
      const cls = await db.class.findFirst({
        where: { id: classId, academicYearId, division: { schoolId } },
        select: { id: true },
      });
      if (!cls) throw new BadRequestException("Class not found in this school and academic year");
    }
    if (sectionId) {
      const section = await db.section.findFirst({ where: { id: sectionId, classId: classId! }, select: { id: true } });
      if (!section) throw new BadRequestException("Section not found in this class");
    }

    if (audience === "INDIVIDUAL") {
      const unique = [...new Set(recipientUserIds)];
      const linked = await this.usersLinkedToSchool(db, schoolId, unique);
      if (linked.size !== unique.length) {
        throw new BadRequestException("Some chosen people are not part of this school");
      }
    }
  }

  async resolve(target: AnnouncementTarget, db: Db = this.prisma): Promise<Recipients> {
    const out: Recipients = { userIds: new Set(), guardians: new Map() };
    const { audience } = target;

    if (audience === "CURRENT_STUDENTS" || audience === "ALL") await this.addCurrentStudents(db, target, out);
    if (audience === "PARENTS" || audience === "ALL") await this.addCurrentParents(db, target, out);
    if (audience === "TEACHERS" || audience === "ALL") await this.addTeachers(db, target, out);
    // Staff belong to the school, not to a class — a class/section-scoped
    // "Everyone" never reaches them.
    if (audience === "STAFF" || (audience === "ALL" && !target.classId)) await this.addStaff(db, target.schoolId, out);
    if (audience === "ALUMNI") await this.addAlumni(db, target.schoolId, out);
    if (audience === "FORMER_PARENTS") await this.addFormerParents(db, target.schoolId, out);
    if (audience === "INDIVIDUAL") await this.addIndividuals(db, target, out);

    return out;
  }

  // One Notification row per person: a parent row (guardianId + their
  // userId, if any) wins over a plain userId row for the same login.
  toNotificationRows(recipients: Recipients) {
    const rows: { guardianId?: string; userId?: string }[] = [];
    const covered = new Set<string>();
    for (const [guardianId, userId] of recipients.guardians) {
      if (userId && covered.has(userId)) continue;
      rows.push(userId ? { guardianId, userId } : { guardianId });
      if (userId) covered.add(userId);
    }
    for (const userId of recipients.userIds) {
      if (!covered.has(userId)) {
        rows.push({ userId });
        covered.add(userId);
      }
    }
    return rows;
  }

  // Active enrollments at this school, narrowed to the scope when given.
  private enrollmentWhere(target: AnnouncementTarget): Prisma.StudentEnrollmentWhereInput {
    return {
      schoolId: target.schoolId,
      status: "ACTIVE",
      ...(target.academicYearId ? { academicYearId: target.academicYearId } : {}),
      ...(target.classId ? { classId: target.classId } : {}),
      ...(target.sectionId ? { sectionId: target.sectionId } : {}),
    };
  }

  private async addCurrentStudents(db: Db, target: AnnouncementTarget, out: Recipients) {
    const students = await db.student.findMany({
      where: { userId: { not: null }, enrollments: { some: this.enrollmentWhere(target) } },
      select: { userId: true },
    });
    for (const s of students) out.userIds.add(s.userId!);
  }

  private async addCurrentParents(db: Db, target: AnnouncementTarget, out: Recipients) {
    const guardians = await db.guardian.findMany({
      where: {
        status: "ACTIVE",
        students: { some: { status: "ACTIVE", student: { enrollments: { some: this.enrollmentWhere(target) } } } },
      },
      select: { id: true, userId: true },
    });
    for (const g of guardians) out.guardians.set(g.id, g.userId);
  }

  // Whole school: teachers employed here, plus teachers assigned here in the
  // current year. Scoped: teachers assigned to that class/section in that year.
  private async addTeachers(db: Db, target: AnnouncementTarget, out: Recipients) {
    const { schoolId, academicYearId, classId, sectionId } = target;
    const where: Prisma.TeacherWhereInput = classId
      ? {
          assignments: {
            some: { schoolId, academicYearId: academicYearId!, ...(sectionId ? { sectionId } : { section: { classId } }) },
          },
        }
      : { OR: [{ schoolId }, { assignments: { some: { schoolId, academicYear: { isCurrent: true } } } }] };
    const teachers = await db.teacher.findMany({
      where: { status: "ACTIVE", userId: { not: null }, ...where },
      select: { userId: true },
    });
    for (const t of teachers) out.userIds.add(t.userId!);
  }

  // Staff records of this school, plus school-assigned users holding a
  // school staff role (e.g. a School Admin has no Staff record).
  private async addStaff(db: Db, schoolId: string, out: Recipients) {
    const [staff, roleUsers] = await Promise.all([
      db.staff.findMany({ where: { schoolId, status: "ACTIVE", userId: { not: null } }, select: { userId: true } }),
      db.user.findMany({
        where: {
          status: "ACTIVE",
          schools: { some: { schoolId } },
          roles: { some: { role: { name: { in: STAFF_ROLES } } } },
        },
        select: { id: true },
      }),
    ]);
    for (const s of staff) out.userIds.add(s.userId!);
    for (const u of roleUsers) out.userIds.add(u.id);
  }

  // Graduates of this school — same rule as the Alumni directory: the
  // student is GRADUATED and graduated from an enrollment here.
  private async addAlumni(db: Db, schoolId: string, out: Recipients) {
    const students = await db.student.findMany({
      where: { userId: { not: null }, currentStatus: "GRADUATED", enrollments: { some: { schoolId, status: "GRADUATED" } } },
      select: { userId: true },
    });
    for (const s of students) out.userIds.add(s.userId!);
  }

  // Parents with former children here and no current child here — the
  // same derivation as Student Access = FORMER_STUDENTS_ONLY.
  private async addFormerParents(db: Db, schoolId: string, out: Recipients) {
    const guardians = await db.guardian.findMany({
      where: { status: "ACTIVE", students: { some: { status: "ACTIVE", student: { enrollments: { some: { schoolId } } } } } },
      select: {
        id: true,
        userId: true,
        students: {
          select: { status: true, student: { select: { enrollments: { where: { schoolId }, select: { schoolId: true, status: true } } } } },
        },
      },
    });
    for (const g of guardians) {
      if (studentAccessFor(g.students, schoolId).studentAccess === "FORMER_STUDENTS_ONLY") out.guardians.set(g.id, g.userId);
    }
  }

  private async addIndividuals(db: Db, target: AnnouncementTarget, out: Recipients) {
    const ids = [...new Set(target.recipientUserIds ?? [])];
    const linked = await this.usersLinkedToSchool(db, target.schoolId, ids);
    // A chosen parent is delivered as a parent (guardianId), so it also
    // reaches their Parent Portal inbox.
    const guardians = await db.guardian.findMany({ where: { userId: { in: [...linked] } }, select: { id: true, userId: true } });
    const parentUserIds = new Set(guardians.map((g) => g.userId));
    for (const g of guardians) out.guardians.set(g.id, g.userId);
    for (const id of linked) if (!parentUserIds.has(id)) out.userIds.add(id);
  }

  // The subset of `userIds` that genuinely belongs to this school, in any
  // role: a student enrolled here (any status), a parent linked to such a
  // student, a teacher or staff member of this school, or a user assigned
  // to it. Anyone else — including another school's people — is dropped.
  async usersLinkedToSchool(db: Db, schoolId: string, userIds: string[]): Promise<Set<string>> {
    if (userIds.length === 0) return new Set();
    const inList = { in: userIds };
    const [students, guardians, teachers, staff, assigned] = await Promise.all([
      db.student.findMany({ where: { userId: inList, enrollments: { some: { schoolId } } }, select: { userId: true } }),
      db.guardian.findMany({
        where: { userId: inList, students: { some: { status: "ACTIVE", student: { enrollments: { some: { schoolId } } } } } },
        select: { userId: true },
      }),
      db.teacher.findMany({
        where: { userId: inList, OR: [{ schoolId }, { assignments: { some: { schoolId } } }] },
        select: { userId: true },
      }),
      db.staff.findMany({ where: { userId: inList, schoolId }, select: { userId: true } }),
      db.userSchool.findMany({ where: { userId: inList, schoolId }, select: { userId: true } }),
    ]);
    const linked = new Set<string>();
    for (const row of [...students, ...guardians, ...teachers, ...staff]) if (row.userId) linked.add(row.userId);
    for (const row of assigned) linked.add(row.userId);
    return linked;
  }
}
