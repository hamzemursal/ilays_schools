import { Body, Controller, Get, Param, Post, UploadedFile, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { ImportsService } from "./imports.service";
import { ResolveImportRowDto } from "./dto/resolve-import-row.dto";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { RequirePermissions } from "../auth/decorators/require-permissions.decorator";
import type { AuthenticatedUser } from "../auth/types/authenticated-user";

const MAX_CSV_SIZE_BYTES = 2 * 1024 * 1024; // 2MB — plenty for a few thousand rows of student data

@Controller("schools/:schoolId/imports/students")
export class ImportsController {
  constructor(private readonly imports: ImportsService) {}

  @RequirePermissions("imports.create")
  @Post()
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: MAX_CSV_SIZE_BYTES } }))
  upload(
    @CurrentUser() user: AuthenticatedUser,
    @Param("schoolId") schoolId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.imports.uploadStudentsCsv(user, schoolId, file);
  }

  @RequirePermissions("imports.create")
  @Get()
  list(@CurrentUser() user: AuthenticatedUser, @Param("schoolId") schoolId: string) {
    return this.imports.listBatches(user, schoolId);
  }

  @RequirePermissions("imports.create")
  @Get(":batchId")
  getOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param("schoolId") schoolId: string,
    @Param("batchId") batchId: string,
  ) {
    return this.imports.getBatch(user, schoolId, batchId);
  }

  @RequirePermissions("imports.create")
  @Post(":batchId/rows/:rowId/resolve")
  resolveRow(
    @CurrentUser() user: AuthenticatedUser,
    @Param("schoolId") schoolId: string,
    @Param("batchId") batchId: string,
    @Param("rowId") rowId: string,
    @Body() dto: ResolveImportRowDto,
  ) {
    return this.imports.resolveRow(user, schoolId, batchId, rowId, dto.action);
  }
}
