import { Module } from "@nestjs/common";
import { SchoolsModule } from "../schools/schools.module";
import { TeachersController } from "./teachers.controller";
import { MyTeachingController } from "./my-teaching.controller";
import { TeachersService } from "./teachers.service";

@Module({
  imports: [SchoolsModule],
  controllers: [TeachersController, MyTeachingController],
  providers: [TeachersService],
})
export class TeachersModule {}
