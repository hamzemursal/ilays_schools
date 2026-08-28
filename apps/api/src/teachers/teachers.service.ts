import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@school-erp/database";
import { PrismaService } from "../prisma/prisma.service";
import { SchoolsService } from "../schools/schools.service";
import type { AuthenticatedUser } from "../auth/types/authenticated-user";
import { CreateTeacherDto } from "./dto/create-teacher.dto";
import { CreateTeacherAssignmentInputDto } from "./dto/create-teacher-assignment-input.dto";

@Injectable()
export class TeachersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly schools: SchoolsService,
  ) {}

  async listForSchool(actor: AuthenticatedUser, schoolId: string) {
    await this.schools.findOneAccessibleOrThrow(actor, schoolId);
    return this.prisma.teacher.findMany({
      where: { schoolId },
      include: { assignments: { include: { subject: true, section: true } } },
      orderBy: { lastName: "asc" },
    });
  }

  async create(actor: AuthenticatedUser, schoolId: string, dto: CreateTeacherDto) {
    await this.schools.findOneAccessibleOrThrow(actor, schoolId);

    for (const a of dto.assignments ?? []) {
      await this.assertAssignmentBelongsToSchool(schoolId, a);
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        const teacher = await tx.teacher.create({
          data: {
            schoolId,
            firstName: dto.firstName,
            lastName: dto.lastName,
            employeeNumber: dto.employeeNumber,
            phone: dto.phone,
            qualification: dto.qualification,
          },
        });

        for (const a of dto.assignments ?? []) {
          await tx.teacherAssignment.create({
            data: {
              teacherId: teacher.id,
              schoolId,
              academicYearId: a.academicYearId,
              sectionId: a.sectionId,
              subjectId: a.subjectId,
            },
          });
        }

        await tx.auditLog.create({
          data: {
            organizationId: actor.organizationId,
            schoolId,
            actorUserId: actor.id,
            action: "teacher.create",
            resource: "Teacher",
            resourceId: teacher.id,
            after: { firstName: teacher.firstName, lastName: teacher.lastName, employeeNumber: teacher.employeeNumber },
          },
        });

        return tx.teacher.findUniqueOrThrow({
          where: { id: teacher.id },
          include: { assignments: { include: { subject: true, section: true } } },
        });
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ConflictException("A teacher with this employee number already exists in this school");
      }
      throw error;
    }
  }

  async addAssignment(actor: AuthenticatedUser, schoolId: string, teacherId: string, dto: CreateTeacherAssignmentInputDto) {
    await this.schools.findOneAccessibleOrThrow(actor, schoolId);

    const teacher = await this.prisma.teacher.findFirst({ where: { id: teacherId, schoolId } });
    if (!teacher) throw new NotFoundException("Teacher not found in this school");

    await this.assertAssignmentBelongsToSchool(schoolId, dto);

    try {
      return await this.prisma.teacherAssignment.create({
        data: {
          teacherId,
          schoolId,
          academicYearId: dto.academicYearId,
          sectionId: dto.sectionId,
          subjectId: dto.subjectId,
        },
        include: { subject: true, section: true },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ConflictException("This teacher is already assigned to that section/subject/year");
      }
      throw error;
    }
  }

  private async assertAssignmentBelongsToSchool(schoolId: string, a: CreateTeacherAssignmentInputDto) {
    const section = await this.prisma.section.findFirst({
      where: { id: a.sectionId, class: { division: { schoolId } } },
    });
    if (!section) throw new BadRequestException("That section does not belong to this school");

    const subject = await this.prisma.subject.findFirst({ where: { id: a.subjectId, schoolId } });
    if (!subject) throw new BadRequestException("That subject does not belong to this school");

    const academicYear = await this.prisma.academicYear.findFirst({ where: { id: a.academicYearId, schoolId } });
    if (!academicYear) throw new BadRequestException("That academic year does not belong to this school");
  }
}
