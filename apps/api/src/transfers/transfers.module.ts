import { Module } from "@nestjs/common";
import { SchoolsModule } from "../schools/schools.module";
import { TransfersController } from "./transfers.controller";
import { TransfersService } from "./transfers.service";

@Module({
  imports: [SchoolsModule],
  controllers: [TransfersController],
  providers: [TransfersService],
})
export class TransfersModule {}
