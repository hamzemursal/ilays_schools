import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { SchoolsService } from "../schools/schools.service";
import { AuditService } from "../audit/audit.service";
import { AuditAction, AuditModuleName } from "../audit/audit-actions";
import type { AuthenticatedUser } from "../auth/types/authenticated-user";
import { CreateExpenseDto, RejectExpenseDto } from "./dto/create-expense.dto";

const EXPENSE_INCLUDE = { expenseCategory: true } as const;

// PENDING -> APPROVED -> PAID, or PENDING -> REJECTED — deliberately not
// immediately-APPROVED like FeeAdjustment/Invoice/Payment: real school
// spending gets a real approval gate before it counts toward the Finance
// Dashboard's expensesTotal (see FinanceDashboardService, which only sums
// APPROVED/PAID rows).
@Injectable()
export class ExpensesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly schools: SchoolsService,
    private readonly audit: AuditService,
  ) {}

  async listForSchool(actor: AuthenticatedUser, schoolId: string, status?: string) {
    await this.schools.findOneAccessibleOrThrow(actor, schoolId);
    return this.prisma.expense.findMany({
      where: { schoolId, ...(status ? { status: status as never } : {}) },
      include: EXPENSE_INCLUDE,
      orderBy: { createdAt: "desc" },
    });
  }

  async create(actor: AuthenticatedUser, schoolId: string, dto: CreateExpenseDto) {
    await this.schools.findOneAccessibleOrThrow(actor, schoolId);

    if (dto.expenseCategoryId) {
      const category = await this.prisma.expenseCategory.findFirst({
        where: { id: dto.expenseCategoryId, schoolId },
      });
      if (!category) throw new BadRequestException("That expense category does not belong to this school");
    }

    const expense = await this.prisma.expense.create({
      data: {
        schoolId,
        expenseCategoryId: dto.expenseCategoryId,
        description: dto.description,
        amount: dto.amount,
        expenseDate: new Date(dto.expenseDate),
        recordedByUserId: actor.id,
      },
      include: EXPENSE_INCLUDE,
    });

    await this.audit.record({
      actor,
      organizationId: actor.organizationId,
      schoolId,
      action: AuditAction.EXPENSE_CREATED,
      module: AuditModuleName.FINANCE,
      resourceType: "Expense",
      resourceId: expense.id,
      resourceName: expense.description,
      after: { amount: dto.amount, description: dto.description },
    });

    return expense;
  }

  async approve(actor: AuthenticatedUser, schoolId: string, expenseId: string) {
    const expense = await this.findInStatusOrThrow(actor, schoolId, expenseId, "PENDING");

    const updated = await this.prisma.expense.update({
      where: { id: expenseId },
      data: { status: "APPROVED", approvedByUserId: actor.id, approvedAt: new Date() },
      include: EXPENSE_INCLUDE,
    });

    await this.audit.record({
      actor,
      organizationId: actor.organizationId,
      schoolId,
      action: AuditAction.EXPENSE_APPROVED,
      module: AuditModuleName.FINANCE,
      resourceType: "Expense",
      resourceId: expenseId,
      resourceName: expense.description,
      before: { status: "PENDING" },
      after: { status: "APPROVED" },
    });

    return updated;
  }

  // No dedicated rejectionReason column exists on Expense (see schema) —
  // the reason is still fully auditable via AuditLog.reason, same as any
  // other rejection in this app that predates a per-row reason field.
  async reject(actor: AuthenticatedUser, schoolId: string, expenseId: string, dto: RejectExpenseDto) {
    const expense = await this.findInStatusOrThrow(actor, schoolId, expenseId, "PENDING");

    const updated = await this.prisma.expense.update({
      where: { id: expenseId },
      data: { status: "REJECTED", approvedByUserId: actor.id, approvedAt: new Date() },
      include: EXPENSE_INCLUDE,
    });

    await this.audit.record({
      actor,
      organizationId: actor.organizationId,
      schoolId,
      action: AuditAction.EXPENSE_REJECTED,
      module: AuditModuleName.FINANCE,
      resourceType: "Expense",
      resourceId: expenseId,
      resourceName: expense.description,
      reason: dto.reason,
      before: { status: "PENDING" },
      after: { status: "REJECTED" },
    });

    return updated;
  }

  async markPaid(actor: AuthenticatedUser, schoolId: string, expenseId: string) {
    const expense = await this.findInStatusOrThrow(actor, schoolId, expenseId, "APPROVED");

    const updated = await this.prisma.expense.update({
      where: { id: expenseId },
      data: { status: "PAID" },
      include: EXPENSE_INCLUDE,
    });

    await this.audit.record({
      actor,
      organizationId: actor.organizationId,
      schoolId,
      action: AuditAction.EXPENSE_PAID,
      module: AuditModuleName.FINANCE,
      resourceType: "Expense",
      resourceId: expenseId,
      resourceName: expense.description,
      before: { status: "APPROVED" },
      after: { status: "PAID" },
    });

    return updated;
  }

  private async findInStatusOrThrow(actor: AuthenticatedUser, schoolId: string, expenseId: string, expectedStatus: string) {
    await this.schools.findOneAccessibleOrThrow(actor, schoolId);
    const expense = await this.prisma.expense.findFirst({ where: { id: expenseId, schoolId } });
    if (!expense) throw new NotFoundException("Expense not found in this school");
    if (expense.status !== expectedStatus) {
      throw new BadRequestException(`This expense is ${expense.status.toLowerCase()}, not ${expectedStatus.toLowerCase()}`);
    }
    return expense;
  }
}
