import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { SchoolsService } from "../schools/schools.service";
import { AuditService } from "../audit/audit.service";
import { AuditAction, AuditModuleName } from "../audit/audit-actions";
import type { AuthenticatedUser } from "../auth/types/authenticated-user";
import { ReversePaymentDto } from "./dto/reverse-payment.dto";

// A REVERSED payment is never deleted — it stays in history, permanently
// excluded from balance calculations from that point on (see
// InvoicesService.toView / ChargesService.toView / StudentLedgerService,
// all of which only ever sum status: "POSTED" payments).
@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly schools: SchoolsService,
    private readonly audit: AuditService,
  ) {}

  async reverse(actor: AuthenticatedUser, paymentId: string, dto: ReversePaymentDto) {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      include: {
        invoice: { include: { payments: true } },
        charge: { include: { payments: true } },
      },
    });
    if (!payment) throw new NotFoundException("Payment not found");

    const schoolId = payment.invoice
      ? (await this.prisma.studentEnrollment.findUniqueOrThrow({ where: { id: payment.invoice.enrollmentId } })).schoolId
      : payment.charge?.schoolId;
    if (!schoolId) throw new NotFoundException("Payment not found");
    await this.schools.findOneAccessibleOrThrow(actor, schoolId);

    if (payment.status === "REVERSED") {
      throw new BadRequestException("This payment has already been reversed");
    }

    return this.prisma.$transaction(async (tx) => {
      const reversed = await tx.payment.update({
        where: { id: paymentId },
        data: {
          status: "REVERSED",
          reversedByUserId: actor.id,
          reversedAt: new Date(),
          reversalReason: dto.reason,
        },
      });

      if (payment.invoice) {
        const remainingPosted = payment.invoice.payments
          .filter((p) => p.id !== paymentId && p.status === "POSTED")
          .reduce((sum, p) => sum + Number(p.amount), 0);
        const newStatus = remainingPosted <= 0 ? "UNPAID" : remainingPosted >= Number(payment.invoice.amount) ? "PAID" : "PARTIALLY_PAID";
        await tx.invoice.update({ where: { id: payment.invoice.id }, data: { status: newStatus } });
      } else if (payment.charge) {
        const remainingPosted = payment.charge.payments
          .filter((p) => p.id !== paymentId && p.status === "POSTED")
          .reduce((sum, p) => sum + Number(p.amount), 0);
        const newStatus = remainingPosted <= 0 ? "OUTSTANDING" : remainingPosted >= Number(payment.charge.amount) ? "PAID" : "PARTIALLY_PAID";
        await tx.charge.update({ where: { id: payment.charge.id }, data: { status: newStatus } });
      }

      await this.audit.record(
        {
          actor,
          organizationId: actor.organizationId,
          schoolId,
          action: AuditAction.PAYMENT_REVERSED,
          module: AuditModuleName.FINANCE,
          resourceType: "Payment",
          resourceId: paymentId,
          severity: "WARNING",
          before: { status: payment.status },
          after: { status: "REVERSED", reason: dto.reason },
        },
        tx,
      );

      return reversed;
    }, { timeout: 30_000 });
  }
}
