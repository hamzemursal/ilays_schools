import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@school-erp/database";
import { PrismaService } from "../prisma/prisma.service";
import { SchoolsService } from "../schools/schools.service";
import { GuardiansService } from "../guardians/guardians.service";
import { NotificationsService } from "../notifications/notifications.service";
import { AuditService } from "../audit/audit.service";
import { AuditAction, AuditModuleName } from "../audit/audit-actions";
import type { AuthenticatedUser } from "../auth/types/authenticated-user";
import {
  CreatePaymentSubmissionDto,
  RejectPaymentSubmissionDto,
  VerifyPaymentSubmissionDto,
} from "./dto/create-payment-submission.dto";

const DEFAULT_PROVIDER = "ZAAD";

// A PaymentSubmission is a claim, not money that has moved the ledger — see
// the schema comment on PaymentSubmission. verify() is the one place a real
// Payment ever gets created from one; reject() never creates anything, so a
// rejected claim can never reduce a balance by construction.
@Injectable()
export class PaymentSubmissionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly schools: SchoolsService,
    private readonly guardians: GuardiansService,
    private readonly notifications: NotificationsService,
    private readonly audit: AuditService,
  ) {}

  // Parent Portal path — schoolId is derived from the student's own current
  // enrollment, never supplied by the caller.
  async submitFromGuardian(actor: AuthenticatedUser, studentId: string, dto: CreatePaymentSubmissionDto) {
    await this.guardians.assertGuardianCanAccessStudent(actor, studentId);
    const enrollment = await this.currentEnrollmentOrThrow(studentId);
    return this.createSubmission(actor, enrollment.schoolId, studentId, dto, actor.id);
  }

  // Every one of a guardian's own past submissions, across every child —
  // lets the Parent Portal show "pending verification" without polling
  // Finance.
  async listForGuardian(actor: AuthenticatedUser) {
    const guardian = await this.guardians.getSelfGuardianOrThrow(actor);
    const links = await this.prisma.studentGuardian.findMany({
      where: { guardianId: guardian.id, status: "ACTIVE" },
      select: { studentId: true },
    });
    return this.prisma.paymentSubmission.findMany({
      where: { studentId: { in: links.map((l) => l.studentId) } },
      orderBy: { createdAt: "desc" },
    });
  }

  // Finance/School-Admin path — covers both a parent-notice-review queue and
  // Finance directly logging a direct ZAAD deposit it discovered without any
  // Parent Portal submission (submittedByUserId stays null for that case).
  async submitFromFinance(actor: AuthenticatedUser, schoolId: string, studentId: string, dto: CreatePaymentSubmissionDto) {
    await this.schools.findOneAccessibleOrThrow(actor, schoolId);
    const enrollment = await this.prisma.studentEnrollment.findFirst({ where: { studentId, schoolId, status: "ACTIVE" } });
    if (!enrollment) throw new BadRequestException("That student has no active enrollment in this school");
    return this.createSubmission(actor, schoolId, studentId, dto, null);
  }

  async listForSchool(actor: AuthenticatedUser, schoolId: string, status?: string) {
    await this.schools.findOneAccessibleOrThrow(actor, schoolId);
    return this.prisma.paymentSubmission.findMany({
      where: { schoolId, ...(status ? { status: status as never } : {}) },
      include: { student: { select: { id: true, firstName: true, lastName: true } } },
      orderBy: { createdAt: "desc" },
    });
  }

  async verify(actor: AuthenticatedUser, schoolId: string, submissionId: string, dto: VerifyPaymentSubmissionDto) {
    const submission = await this.findPendingOrThrow(actor, schoolId, submissionId);

    if (dto.invoiceId && dto.chargeId) {
      throw new BadRequestException("Provide at most one of invoiceId or chargeId");
    }
    const invoiceId = dto.invoiceId ?? submission.invoiceId ?? undefined;
    const chargeId = dto.chargeId ?? submission.chargeId ?? undefined;
    if (!invoiceId && !chargeId) {
      throw new BadRequestException("This submission isn't matched to an invoice or charge yet — provide one to verify it");
    }
    if (invoiceId && chargeId) {
      throw new BadRequestException("This submission is matched to both an invoice and a charge — that shouldn't happen");
    }

    const amount = Number(submission.amount);

    const result = await this.prisma.$transaction(async (tx) => {
      let newTargetStatus: string;

      if (invoiceId) {
        const invoice = await tx.invoice.findFirst({ where: { id: invoiceId }, include: { payments: true } });
        if (!invoice) throw new BadRequestException("That invoice does not exist");
        const alreadyPaid = invoice.payments.filter((p) => p.status === "POSTED").reduce((sum, p) => sum + Number(p.amount), 0);
        const remaining = Number(invoice.amount) - alreadyPaid;
        if (amount > remaining) {
          throw new BadRequestException(`Submission amount ${amount} exceeds the remaining balance of ${remaining.toFixed(2)}`);
        }
        newTargetStatus = alreadyPaid + amount >= Number(invoice.amount) ? "PAID" : "PARTIALLY_PAID";
        await tx.invoice.update({ where: { id: invoiceId }, data: { status: newTargetStatus as never } });
      } else {
        const charge = await tx.charge.findFirst({ where: { id: chargeId }, include: { payments: true } });
        if (!charge) throw new BadRequestException("That charge does not exist");
        const alreadyPaid = charge.payments.filter((p) => p.status === "POSTED").reduce((sum, p) => sum + Number(p.amount), 0);
        const remaining = Number(charge.amount) - alreadyPaid;
        if (amount > remaining) {
          throw new BadRequestException(`Submission amount ${amount} exceeds the remaining balance of ${remaining.toFixed(2)}`);
        }
        newTargetStatus = alreadyPaid + amount >= Number(charge.amount) ? "PAID" : "PARTIALLY_PAID";
        await tx.charge.update({ where: { id: chargeId! }, data: { status: newTargetStatus as never } });
      }

      const payment = await tx.payment.create({
        data: {
          invoiceId,
          chargeId,
          amount: submission.amount,
          method: "MOBILE_MONEY",
          reference: submission.providerTransactionReference,
          recordedByUserId: actor.id,
          paymentSubmissionId: submission.id,
        },
      });

      const updated = await tx.paymentSubmission.update({
        where: { id: submissionId },
        data: {
          status: "VERIFIED",
          verifiedByUserId: actor.id,
          verifiedAt: new Date(),
          invoiceId,
          chargeId,
        },
      });

      await this.audit.record(
        {
          actor,
          organizationId: actor.organizationId,
          schoolId,
          action: AuditAction.ZAAD_VERIFIED,
          module: AuditModuleName.FINANCE,
          resourceType: "PaymentSubmission",
          resourceId: submissionId,
          after: { amount, paymentId: payment.id },
        },
        tx,
      );

      return updated;
    }, { timeout: 30_000 });

    await this.notifyStudentGuardians(submission.studentId, {
      title: "Payment verified",
      body: `Your $${amount.toFixed(2)} ZAAD payment was verified and posted.`,
      actionUrl: "/parent/fees",
    });

    return result;
  }

  async reject(actor: AuthenticatedUser, schoolId: string, submissionId: string, dto: RejectPaymentSubmissionDto) {
    const submission = await this.findPendingOrThrow(actor, schoolId, submissionId);

    const updated = await this.prisma.paymentSubmission.update({
      where: { id: submissionId },
      data: { status: "REJECTED", verifiedByUserId: actor.id, verifiedAt: new Date(), rejectionReason: dto.reason },
    });

    await this.audit.record({
      actor,
      organizationId: actor.organizationId,
      schoolId,
      action: AuditAction.ZAAD_REJECTED,
      module: AuditModuleName.FINANCE,
      resourceType: "PaymentSubmission",
      resourceId: submissionId,
      before: { status: submission.status },
      after: { status: "REJECTED", reason: dto.reason },
    });

    await this.notifyStudentGuardians(submission.studentId, {
      title: "Payment rejected",
      body: `Your $${Number(submission.amount).toFixed(2)} ZAAD payment notice was rejected: ${dto.reason}`,
      actionUrl: "/parent/fees",
    });

    return updated;
  }

  // Every active guardian of the student, not just whoever submitted the
  // notice — Finance can log a submission directly (submittedByUserId null),
  // and a payment concerns every guardian linked to the child either way.
  private async notifyStudentGuardians(studentId: string, notif: { title: string; body: string; actionUrl?: string }) {
    const links = await this.prisma.studentGuardian.findMany({
      where: { studentId, status: "ACTIVE" },
      select: { guardianId: true },
    });
    await Promise.all(links.map((l) => this.notifications.notifyGuardian(l.guardianId, notif)));
  }

  private async createSubmission(
    actor: AuthenticatedUser,
    schoolId: string,
    studentId: string,
    dto: CreatePaymentSubmissionDto,
    submittedByUserId: string | null,
  ) {
    if (dto.invoiceId && dto.chargeId) {
      throw new BadRequestException("Provide at most one of invoiceId or chargeId");
    }

    try {
      const submission = await this.prisma.paymentSubmission.create({
        data: {
          schoolId,
          studentId,
          invoiceId: dto.invoiceId,
          chargeId: dto.chargeId,
          amount: dto.amount,
          provider: dto.provider ?? DEFAULT_PROVIDER,
          providerTransactionReference: dto.providerTransactionReference,
          payerPhone: dto.payerPhone,
          payerName: dto.payerName,
          submittedByUserId,
          note: dto.note,
        },
      });

      await this.audit.record({
        actor,
        organizationId: actor.organizationId,
        schoolId,
        action: AuditAction.ZAAD_SUBMITTED,
        module: AuditModuleName.FINANCE,
        resourceType: "PaymentSubmission",
        resourceId: submission.id,
        after: { amount: dto.amount, provider: submission.provider },
      });

      return submission;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ConflictException(
          "A submission with this provider transaction reference already exists for this school",
        );
      }
      throw error;
    }
  }

  private async currentEnrollmentOrThrow(studentId: string) {
    const enrollment = await this.prisma.studentEnrollment.findFirst({
      where: { studentId, status: "ACTIVE" },
      orderBy: { startDate: "desc" },
    });
    if (!enrollment) throw new BadRequestException("This student has no active enrollment right now");
    return enrollment;
  }

  private async findPendingOrThrow(actor: AuthenticatedUser, schoolId: string, submissionId: string) {
    await this.schools.findOneAccessibleOrThrow(actor, schoolId);
    const submission = await this.prisma.paymentSubmission.findFirst({ where: { id: submissionId, schoolId } });
    if (!submission) throw new NotFoundException("Payment submission not found in this school");
    if (submission.status !== "PENDING") {
      throw new BadRequestException(`This submission has already been ${submission.status.toLowerCase()}`);
    }
    return submission;
  }
}
