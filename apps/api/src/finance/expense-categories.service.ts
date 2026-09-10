import { ConflictException, Injectable } from "@nestjs/common";
import { Prisma } from "@school-erp/database";
import { PrismaService } from "../prisma/prisma.service";
import { SchoolsService } from "../schools/schools.service";
import type { AuthenticatedUser } from "../auth/types/authenticated-user";
import { CreateExpenseCategoryDto } from "./dto/create-expense-category.dto";

// A plain per-school configurable lookup — same reasoning as Department:
// a school's expense categories vary too much to hard-code.
@Injectable()
export class ExpenseCategoriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly schools: SchoolsService,
  ) {}

  async listForSchool(actor: AuthenticatedUser, schoolId: string) {
    await this.schools.findOneAccessibleOrThrow(actor, schoolId);
    return this.prisma.expenseCategory.findMany({ where: { schoolId }, orderBy: { name: "asc" } });
  }

  async create(actor: AuthenticatedUser, schoolId: string, dto: CreateExpenseCategoryDto) {
    await this.schools.findOneAccessibleOrThrow(actor, schoolId);
    try {
      return await this.prisma.expenseCategory.create({ data: { schoolId, name: dto.name } });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ConflictException("An expense category with this name already exists in this school");
      }
      throw error;
    }
  }
}
