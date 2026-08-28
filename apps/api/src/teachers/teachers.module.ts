import { Module } from "@nestjs/common";
import { SchoolsModule } from "../schools/schools.module";
import { TeachersController } from "./teachers.controller";
import { TeachersService } from "./teachers.service";

@Module({
  imports: [SchoolsModule],
  controllers: [TeachersController],
  providers: [TeachersService],
})
export class TeachersModule {}
