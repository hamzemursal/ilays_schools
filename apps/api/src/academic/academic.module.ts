import { Module } from "@nestjs/common";
import { SchoolsModule } from "../schools/schools.module";
import { AuditModule } from "../audit/audit.module";
import { AcademicYearsController } from "./academic-years.controller";
import { AcademicYearsService } from "./academic-years.service";
import { ClassesController } from "./classes.controller";
import { ClassesService } from "./classes.service";
import { SubjectsController } from "./subjects.controller";
import { SubjectsService } from "./subjects.service";

@Module({
  imports: [SchoolsModule, AuditModule],
  controllers: [AcademicYearsController, ClassesController, SubjectsController],
  providers: [AcademicYearsService, ClassesService, SubjectsService],
})
export class AcademicModule {}
