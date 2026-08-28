import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import { ExamsService } from "./exams.service";
import { CreateExamDto } from "./dto/create-exam.dto";
import { CreateExamSubjectDto } from "./dto/create-exam-subject.dto";
import { EnterMarksDto } from "./dto/enter-marks.dto";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { RequirePermissions } from "../auth/decorators/require-permissions.decorator";
import type { AuthenticatedUser } from "../auth/types/authenticated-user";

@Controller("schools/:schoolId/exams")
export class ExamsController {
  constructor(private readonly exams: ExamsService) {}

  @RequirePermissions("results.view")
  @Get()
  list(@CurrentUser() user: AuthenticatedUser, @Param("schoolId") schoolId: string) {
    return this.exams.listExams(user, schoolId);
  }

  @RequirePermissions("results.approve")
  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Param("schoolId") schoolId: string, @Body() dto: CreateExamDto) {
    return this.exams.createExam(user, schoolId, dto);
  }

  @RequirePermissions("results.view")
  @Get(":examId/subjects")
  listSubjects(
    @CurrentUser() user: AuthenticatedUser,
    @Param("schoolId") schoolId: string,
    @Param("examId") examId: string,
  ) {
    return this.exams.listExamSubjects(user, schoolId, examId);
  }

  @RequirePermissions("results.approve")
  @Post(":examId/subjects")
  createSubject(
    @CurrentUser() user: AuthenticatedUser,
    @Param("schoolId") schoolId: string,
    @Param("examId") examId: string,
    @Body() dto: CreateExamSubjectDto,
  ) {
    return this.exams.createExamSubject(user, schoolId, examId, dto);
  }

  @RequirePermissions("results.view")
  @Get(":examId/subjects/:examSubjectId/sections/:sectionId/results")
  getResults(
    @CurrentUser() user: AuthenticatedUser,
    @Param("schoolId") schoolId: string,
    @Param("examSubjectId") examSubjectId: string,
    @Param("sectionId") sectionId: string,
  ) {
    return this.exams.getResultsForSection(user, schoolId, examSubjectId, sectionId);
  }

  @RequirePermissions("results.enter")
  @Post(":examId/subjects/:examSubjectId/sections/:sectionId/results")
  enterMarks(
    @CurrentUser() user: AuthenticatedUser,
    @Param("schoolId") schoolId: string,
    @Param("examSubjectId") examSubjectId: string,
    @Param("sectionId") sectionId: string,
    @Body() dto: EnterMarksDto,
  ) {
    return this.exams.enterMarks(user, schoolId, examSubjectId, sectionId, dto);
  }

  @RequirePermissions("results.approve")
  @Post(":examId/subjects/:examSubjectId/approve")
  approve(
    @CurrentUser() user: AuthenticatedUser,
    @Param("schoolId") schoolId: string,
    @Param("examSubjectId") examSubjectId: string,
  ) {
    return this.exams.approveResults(user, schoolId, examSubjectId);
  }
}
