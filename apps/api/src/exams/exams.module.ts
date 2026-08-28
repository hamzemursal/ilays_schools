import { Module } from "@nestjs/common";
import { SchoolsModule } from "../schools/schools.module";
import { ExamsController } from "./exams.controller";
import { ExamsService } from "./exams.service";

@Module({
  imports: [SchoolsModule],
  controllers: [ExamsController],
  providers: [ExamsService],
})
export class ExamsModule {}
