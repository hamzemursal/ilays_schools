import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import { FeeStructuresService } from "./fee-structures.service";
import { CreateFeeStructureDto } from "./dto/create-fee-structure.dto";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { RequirePermissions } from "../auth/decorators/require-permissions.decorator";
import type { AuthenticatedUser } from "../auth/types/authenticated-user";

@Controller("schools/:schoolId/fee-structures")
export class FeeStructuresController {
  constructor(private readonly feeStructures: FeeStructuresService) {}

  @RequirePermissions("fees.manage")
  @Get()
  list(@CurrentUser() user: AuthenticatedUser, @Param("schoolId") schoolId: string) {
    return this.feeStructures.listForSchool(user, schoolId);
  }

  @RequirePermissions("fees.manage")
  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Param("schoolId") schoolId: string,
    @Body() dto: CreateFeeStructureDto,
  ) {
    return this.feeStructures.create(user, schoolId, dto);
  }
}
