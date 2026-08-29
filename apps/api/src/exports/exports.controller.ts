import { Controller, Get, Param, Res } from "@nestjs/common";
import type { Response } from "express";
import { ExportsService } from "./exports.service";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { RequirePermissions } from "../auth/decorators/require-permissions.decorator";
import type { AuthenticatedUser } from "../auth/types/authenticated-user";

@Controller("schools/:schoolId/exports")
export class ExportsController {
  constructor(private readonly exports: ExportsService) {}

  @RequirePermissions("exports.create")
  @Get("students")
  async students(
    @CurrentUser() user: AuthenticatedUser,
    @Param("schoolId") schoolId: string,
    @Res() res: Response,
  ) {
    const csv = await this.exports.exportStudents(user, schoolId);
    this.send(res, csv, "students.csv");
  }

  @RequirePermissions("exports.create")
  @Get("teachers")
  async teachers(
    @CurrentUser() user: AuthenticatedUser,
    @Param("schoolId") schoolId: string,
    @Res() res: Response,
  ) {
    const csv = await this.exports.exportTeachers(user, schoolId);
    this.send(res, csv, "teachers.csv");
  }

  @RequirePermissions("exports.create")
  @Get("invoices")
  async invoices(
    @CurrentUser() user: AuthenticatedUser,
    @Param("schoolId") schoolId: string,
    @Res() res: Response,
  ) {
    const csv = await this.exports.exportInvoices(user, schoolId);
    this.send(res, csv, "invoices.csv");
  }

  private send(res: Response, csv: string, filename: string) {
    res.set({
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    });
    res.send(csv);
  }
}
