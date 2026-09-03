import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { SchoolsService } from "../schools/schools.service";
import { StudentsService } from "../students/students.service";
import { AuditService } from "../audit/audit.service";
import { AuditAction, AuditModuleName } from "../audit/audit-actions";
import type { AuthenticatedUser } from "../auth/types/authenticated-user";
import { RecordPaymentDto } from "./dto/record-payment.dto";
import type { Prisma } from "@school-erp/database";

type InvoiceWithRelations = Prisma.InvoiceGetPayload<{ include: { payments: true; feeStructure: true } }>;

@Injectable()
export class InvoicesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly schools: SchoolsService,
    private readonly students: StudentsService,
    private readonly audit: AuditService,
  ) {}

  async generateForFeeStructure(actor: AuthenticatedUser, schoolId: string, feeStructureId: string) {
    await this.schools.findOneAccessibleOrThrow(actor, schoolId);

    const feeStructure = await this.prisma.feeStructure.findFirst({ where: { id: feeStructureId, schoolId } });
    if (!feeStructure) throw new NotFoundException("Fee structure not found in this school");

    const enrollments = await this.prisma.studentEnrollment.findMany({
      where: {
        schoolId,
        academicYearId: feeStructure.academicYearId,
        status: "ACTIVE",
        ...(feeStructure.classId ? { classId: feeStructure.classId } : {}),
      },
      select: { id: true },
    });

    const result = await this.prisma.invoice.createMany({
      data: enrollments.map((e) => ({
        enrollmentId: e.id,
        feeStructureId,
        amount: feeStructure.amount,
      })),
      skipDuplicates: true, // an enrollment that already has this invoice is left untouched
    });

    await this.audit.record({
      actor,
      organizationId: actor.organizationId,
      schoolId,
      action: AuditAction.INVOICES_GENERATED,
      module: AuditModuleName.FINANCE,
      resourceType: "FeeStructure",
      resourceId: feeStructureId,
      after: { createdCount: result.count, eligibleEnrollments: enrollments.length },
    });

    return { createdCount: result.count, eligibleEnrollments: enrollments.length };
  }

  async listForSchool(actor: AuthenticatedUser, schoolId: string, status?: string) {
    await this.schools.findOneAccessibleOrThrow(actor, schoolId);

    const invoices = await this.prisma.invoice.findMany({
      where: { enrollment: { schoolId }, ...(status ? { status: status as never } : {}) },
      include: { feeStructure: true, payments: true, enrollment: { include: { student: true } } },
      orderBy: { createdAt: "desc" },
    });

    return invoices.map((inv) => ({
      ...this.toView(inv),
      studentId: inv.enrollment.studentId,
      firstName: inv.enrollment.student.firstName,
      lastName: inv.enrollment.student.lastName,
    }));
  }

  async listForStudent(actor: AuthenticatedUser, studentId: string) {
    await this.students.assertAccessibleStudent(actor, studentId);

    const invoices = await this.prisma.invoice.findMany({
      where: {
        enrollment: {
          studentId,
          ...(actor.schoolIds.length > 0 ? { schoolId: { in: actor.schoolIds } } : {}),
        },
      },
      include: { feeStructure: true, payments: true },
      orderBy: { createdAt: "desc" },
    });

    return invoices.map((inv) => this.toView(inv));
  }

  async recordPayment(actor: AuthenticatedUser, invoiceId: string, dto: RecordPaymentDto) {
    const invoice = await this.getAccessibleInvoiceOrThrow(actor, invoiceId);

    const alreadyPaid = invoice.payments.reduce((sum, p) => sum + Number(p.amount), 0);
    const remaining = Number(invoice.amount) - alreadyPaid;
    if (dto.amount > remaining) {
      throw new BadRequestException(
        `Payment of ${dto.amount} exceeds the remaining balance of ${remaining.toFixed(2)}`,
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const payment = await tx.payment.create({
        data: {
          invoiceId,
          amount: dto.amount,
          method: dto.method,
          reference: dto.reference,
          recordedByUserId: actor.id,
        },
      });

      const newTotal = alreadyPaid + dto.amount;
      const newStatus = newTotal >= Number(invoice.amount) ? "PAID" : "PARTIALLY_PAID";
      await tx.invoice.update({ where: { id: invoiceId }, data: { status: newStatus } });

      await this.audit.record(
        {
          actor,
          organizationId: actor.organizationId,
          schoolId: invoice.enrollment.schoolId,
          action: AuditAction.PAYMENT_RECORDED,
          module: AuditModuleName.FINANCE,
          resourceType: "Invoice",
          resourceId: invoiceId,
          after: { amount: dto.amount, method: dto.method ?? "CASH", newStatus },
        },
        tx,
      );

      return payment;
    }, { timeout: 30_000 });
  }

  async listPayments(actor: AuthenticatedUser, invoiceId: string) {
    await this.getAccessibleInvoiceOrThrow(actor, invoiceId);
    return this.prisma.payment.findMany({ where: { invoiceId }, orderBy: { paidAt: "desc" } });
  }

  private async getAccessibleInvoiceOrThrow(actor: AuthenticatedUser, invoiceId: string) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: { payments: true, feeStructure: true, enrollment: true },
    });
    if (!invoice) throw new NotFoundException("Invoice not found");
    await this.schools.findOneAccessibleOrThrow(actor, invoice.enrollment.schoolId);
    return invoice;
  }

  private toView(invoice: InvoiceWithRelations) {
    const paid = invoice.payments.reduce((sum, p) => sum + Number(p.amount), 0);
    return {
      id: invoice.id,
      amount: Number(invoice.amount),
      status: invoice.status,
      dueDate: invoice.dueDate,
      paid,
      balance: Number(invoice.amount) - paid,
      feeStructure: { id: invoice.feeStructure.id, name: invoice.feeStructure.name },
    };
  }
}
