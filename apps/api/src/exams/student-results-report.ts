import { NotFoundException } from "@nestjs/common";
import type { PrismaService } from "../prisma/prisma.service";
import {
  ELIGIBILITY_THRESHOLD,
  combineTermPercentages,
  percentageFromMarks,
  publishedMarkedResultWhere,
} from "./result-calculation";

export interface PortalResultRow {
  id: string;
  examName: string;
  examType: string;
  subjectName: string;
  marksObtained: number;
  maxMarks: number;
  percentage: number;
  examDate: Date | null;
  publishedDate: Date | null;
}

export interface PortalTermResults {
  name: "Term 1" | "Term 2";
  // null when this academic year has no Term row of that name configured.
  termId: string | null;
  weight: number | null;
  results: PortalResultRow[];
  // SUM(marks)/SUM(max) over the published results above — the same number
  // ExamsService.getTermPercentage produces. null = Incomplete, never 0.
  percentage: number | null;
}

export interface PortalResultsReport {
  academicYear: { id: string; name: string; isCurrent: boolean };
  enrollment: { schoolName: string; className: string; sectionName: string };
  terms: [PortalTermResults, PortalTermResults];
  // Published results of exams that belong to no term. Shown so nothing the
  // school published disappears, but they are NOT part of any term average or
  // of the annual result (and are not a third term).
  otherResults: PortalResultRow[];
  annual: {
    term1Percentage: number | null;
    term2Percentage: number | null;
    annualPercentage: number | null;
    eligible: boolean | null;
    passMark: number;
  };
}

// The single read path behind both the Student Portal and the Parent Portal
// results pages. It performs NO authorization — the caller must already have
// proven `studentId` is the actor's own (StudentPortalService.getSelfOrThrow)
// or a linked child (GuardiansService.assertGuardianCanAccessStudent).
//
// Scoped to ONE academic year, resolved from that year's own enrollment(s) —
// never from the student's live enrollment: enrollments are looked up by
// {studentId, academicYearId} and never by academicYearId + status ACTIVE
// (a PROMOTED/RETAINED historical enrollment is still that year's truth).
// With no year given it defaults to the year of the current ACTIVE enrollment.
export async function buildStudentResultsReport(
  prisma: PrismaService,
  studentId: string,
  academicYearId?: string,
): Promise<PortalResultsReport> {
  const allEnrollments = await prisma.studentEnrollment.findMany({
    where: academicYearId ? { studentId, academicYearId } : { studentId },
    include: { school: true, academicYear: true, class: true, section: true },
    orderBy: { startDate: "desc" },
  });

  const anchor = academicYearId ? allEnrollments[0] : (allEnrollments.find((e) => e.status === "ACTIVE") ?? allEnrollments[0]);
  if (!anchor) {
    throw new NotFoundException("No enrollment found for this student in that academic year");
  }
  const yearEnrollments = allEnrollments.filter((e) => e.academicYearId === anchor.academicYearId);

  const [terms, results] = await Promise.all([
    prisma.term.findMany({ where: { academicYearId: anchor.academicYearId } }),
    prisma.result.findMany({
      where: {
        enrollmentId: { in: yearEnrollments.map((e) => e.id) },
        ...publishedMarkedResultWhere(),
      },
      include: { examSubject: { include: { exam: true, subject: true } }, resultSubmission: true },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  const rows = results
    .filter((r) => r.marksObtained !== null)
    .map((r) => {
      const marksObtained = Number(r.marksObtained);
      const maxMarks = r.examSubject.maxMarks;
      return {
        termId: r.examSubject.exam.termId,
        row: {
          id: r.id,
          examName: r.examSubject.exam.name,
          examType: r.examSubject.exam.type,
          subjectName: r.examSubject.subject.name,
          marksObtained,
          maxMarks,
          percentage: Math.round((marksObtained / maxMarks) * 1000) / 10,
          examDate: r.examSubject.examDate,
          publishedDate: r.resultSubmission.publishedAt,
        } satisfies PortalResultRow,
      };
    });

  const byExamThenSubject = (a: PortalResultRow, b: PortalResultRow) =>
    a.examName.localeCompare(b.examName) || a.subjectName.localeCompare(b.subjectName);

  const buildTerm = (name: "Term 1" | "Term 2"): PortalTermResults => {
    const term = terms.find((t) => t.name === name);
    const termRows = term ? rows.filter((r) => r.termId === term.id).map((r) => r.row) : [];
    return {
      name,
      termId: term?.id ?? null,
      weight: term?.weight ?? null,
      results: termRows.sort(byExamThenSubject),
      percentage: percentageFromMarks(termRows),
    };
  };

  const term1 = buildTerm("Term 1");
  const term2 = buildTerm("Term 2");
  const knownTermIds = new Set(terms.map((t) => t.id));
  const otherResults = rows
    .filter((r) => r.termId === null || !knownTermIds.has(r.termId))
    .map((r) => r.row)
    .sort(byExamThenSubject);

  // The annual result needs both terms configured; otherwise it is
  // undetermined (all null), exactly as ExamsService.getAnnualResult reports.
  const annualParts =
    term1.weight !== null && term2.weight !== null
      ? combineTermPercentages(term1.percentage, term2.percentage, term1.weight, term2.weight)
      : { annualPercentage: null, eligible: null };

  return {
    academicYear: { id: anchor.academicYearId, name: anchor.academicYear.name, isCurrent: anchor.academicYear.isCurrent },
    enrollment: { schoolName: anchor.school.name, className: anchor.class.name, sectionName: anchor.section.name },
    terms: [term1, term2],
    otherResults,
    annual: {
      term1Percentage: term1.weight !== null ? term1.percentage : null,
      term2Percentage: term2.weight !== null ? term2.percentage : null,
      annualPercentage: annualParts.annualPercentage,
      eligible: annualParts.eligible,
      passMark: ELIGIBILITY_THRESHOLD,
    },
  };
}
