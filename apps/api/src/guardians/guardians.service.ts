import { Injectable } from "@nestjs/common";
import type { Prisma } from "@school-erp/database";
import { PrismaService } from "../prisma/prisma.service";
import { GuardianInputDto } from "./dto/guardian-input.dto";

type Tx = Prisma.TransactionClient;

@Injectable()
export class GuardiansService {
  constructor(private readonly prisma: PrismaService) {}

  // Reuses an existing guardian when phone or email matches — this is what
  // keeps "one parent, many children" true instead of creating a new
  // Guardian row every time the same parent is added to another child.
  // Exact-match only (phone/email), never fuzzy — unlike student duplicate
  // detection, there's no ambiguity worth flagging for human review here.
  async findOrCreate(tx: Tx, input: GuardianInputDto) {
    if (input.phone) {
      const existing = await tx.guardian.findFirst({ where: { phone: input.phone } });
      if (existing) return existing;
    }
    if (input.email) {
      const existing = await tx.guardian.findFirst({ where: { email: input.email } });
      if (existing) return existing;
    }
    return tx.guardian.create({
      data: {
        firstName: input.firstName,
        lastName: input.lastName,
        phone: input.phone,
        email: input.email,
      },
    });
  }

  async linkToStudent(
    tx: Tx,
    studentId: string,
    guardianId: string,
    relationship: GuardianInputDto["relationship"],
    isPrimaryContact?: boolean,
  ) {
    return tx.studentGuardian.upsert({
      where: { studentId_guardianId: { studentId, guardianId } },
      update: { relationship, isPrimaryContact },
      create: { studentId, guardianId, relationship, isPrimaryContact: isPrimaryContact ?? false },
    });
  }

  async listForStudent(studentId: string) {
    const links = await this.prisma.studentGuardian.findMany({
      where: { studentId },
      include: { guardian: true },
    });
    return links.map((l) => ({ ...l.guardian, relationship: l.relationship, isPrimaryContact: l.isPrimaryContact }));
  }
}
