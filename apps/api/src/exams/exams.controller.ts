import { BadRequestException, Body, Controller, Get, Param, Patch, Post, UploadedFile, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { ExamsService } from "./exams.service";
import { CreateExamDto } from "./dto/create-exam.dto";
import { CreateExamSubjectDto } from "./dto/create-exam-subject.dto";
import { UpdateExamSubjectDto } from "./dto/update-exam-subject.dto";
import { EnterMarksDto } from "./dto/enter-marks.dto";
import { ReturnForCorrectionDto } from "./dto/return-for-correction.dto";
import { UnpublishResultsDto } from "./dto/unpublish-results.dto";
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

  @RequirePermissions("results.approve")
  @Patch(":examId/subjects/:examSubjectId")
  updateSubject(
    @CurrentUser() user: AuthenticatedUser,
    @Param("schoolId") schoolId: string,
    @Param("examId") examId: string,
    @Param("examSubjectId") examSubjectId: string,
    @Body() dto: UpdateExamSubjectDto,
  ) {
    return this.exams.updateExamSubject(user, schoolId, examId, examSubjectId, dto);
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

  @RequirePermissions("results.enter")
  @Post(":examId/subjects/:examSubjectId/sections/:sectionId/submit")
  submitForReview(
    @CurrentUser() user: AuthenticatedUser,
    @Param("schoolId") schoolId: string,
    @Param("examSubjectId") examSubjectId: string,
    @Param("sectionId") sectionId: string,
  ) {
    return this.exams.submitForReview(user, schoolId, examSubjectId, sectionId);
  }

  @RequirePermissions("results.approve")
  @Post(":examId/subjects/:examSubjectId/sections/:sectionId/return")
  returnForCorrection(
    @CurrentUser() user: AuthenticatedUser,
    @Param("schoolId") schoolId: string,
    @Param("examSubjectId") examSubjectId: string,
    @Param("sectionId") sectionId: string,
    @Body() dto: ReturnForCorrectionDto,
  ) {
    return this.exams.returnForCorrection(user, schoolId, examSubjectId, sectionId, dto);
  }

  @RequirePermissions("results.approve")
  @Post(":examId/subjects/:examSubjectId/sections/:sectionId/approve")
  approve(
    @CurrentUser() user: AuthenticatedUser,
    @Param("schoolId") schoolId: string,
    @Param("examSubjectId") examSubjectId: string,
    @Param("sectionId") sectionId: string,
  ) {
    return this.exams.approveSubmission(user, schoolId, examSubjectId, sectionId);
  }

  @RequirePermissions("results.approve")
  @Post(":examId/subjects/:examSubjectId/sections/:sectionId/publish")
  publish(
    @CurrentUser() user: AuthenticatedUser,
    @Param("schoolId") schoolId: string,
    @Param("examSubjectId") examSubjectId: string,
    @Param("sectionId") sectionId: string,
  ) {
    return this.exams.publishSubmission(user, schoolId, examSubjectId, sectionId);
  }

  @RequirePermissions("results.approve")
  @Post(":examId/subjects/:examSubjectId/sections/:sectionId/unpublish")
  unpublish(
    @CurrentUser() user: AuthenticatedUser,
    @Param("schoolId") schoolId: string,
    @Param("examSubjectId") examSubjectId: string,
    @Param("sectionId") sectionId: string,
    @Body() dto: UnpublishResultsDto,
  ) {
    return this.exams.unpublishSubmission(user, schoolId, examSubjectId, sectionId, dto);
  }

  @RequirePermissions("results.enter")
  @Get(":examId/subjects/:examSubjectId/sections/:sectionId/paper")
  getPaper(
    @CurrentUser() user: AuthenticatedUser,
    @Param("schoolId") schoolId: string,
    @Param("examSubjectId") examSubjectId: string,
    @Param("sectionId") sectionId: string,
  ) {
    return this.exams.getExamPaper(user, schoolId, examSubjectId, sectionId);
  }

  @RequirePermissions("results.enter")
  @Post(":examId/subjects/:examSubjectId/sections/:sectionId/paper")
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: 10 * 1024 * 1024 } }))
  uploadPaper(
    @CurrentUser() user: AuthenticatedUser,
    @Param("schoolId") schoolId: string,
    @Param("examSubjectId") examSubjectId: string,
    @Param("sectionId") sectionId: string,
    @UploadedFile() file: Express.Multer.File,
    @Body("notes") notes?: string,
    @Body("submit") submit?: string,
  ) {
    if (!file) throw new BadRequestException("No file uploaded");
    return this.exams.uploadExamPaper(user, schoolId, examSubjectId, sectionId, file, notes, submit === "true");
  }
}
