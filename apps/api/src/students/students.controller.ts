import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import { StudentsService } from "./students.service";
import { CreateStudentDto } from "./dto/create-student.dto";
import { GuardianInputDto } from "../guardians/dto/guardian-input.dto";
import { GuardiansService } from "../guardians/guardians.service";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { RequirePermissions } from "../auth/decorators/require-permissions.decorator";
import type { AuthenticatedUser } from "../auth/types/authenticated-user";
import { PrismaService } from "../prisma/prisma.service";

@Controller()
export class StudentsController {
  constructor(
    private readonly students: StudentsService,
    private readonly guardians: GuardiansService,
    private readonly prisma: PrismaService,
  ) {}

  @RequirePermissions("students.view")
  @Get("schools/:schoolId/students")
  listForSchool(@CurrentUser() user: AuthenticatedUser, @Param("schoolId") schoolId: string) {
    return this.students.listForSchool(user, schoolId);
  }

  @RequirePermissions("students.create")
  @Post("schools/:schoolId/students")
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Param("schoolId") schoolId: string,
    @Body() dto: CreateStudentDto,
  ) {
    return this.students.create(user, schoolId, dto);
  }

  @RequirePermissions("students.view")
  @Get("students/:id")
  getOne(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    return this.students.getOne(user, id);
  }

  @RequirePermissions("guardians.manage")
  @Post("students/:id/guardians")
  async addGuardian(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Body() dto: GuardianInputDto,
  ) {
    await this.students.assertAccessibleStudent(user, id);
    const guardian = await this.guardians.findOrCreate(this.prisma, dto);
    await this.guardians.linkToStudent(this.prisma, id, guardian.id, dto.relationship, dto.isPrimaryContact);
    return guardian;
  }
}
