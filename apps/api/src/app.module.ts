import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { ThrottlerModule, ThrottlerGuard } from "@nestjs/throttler";
import { APP_GUARD } from "@nestjs/core";
import { PrismaModule } from "./prisma/prisma.module";
import { RedisModule } from "./redis/redis.module";
import { HealthModule } from "./health/health.module";
import { AuthModule } from "./auth/auth.module";
import { TotpModule } from "./totp/totp.module";
import { JwtAuthGuard } from "./auth/guards/jwt-auth.guard";
import { PermissionsGuard } from "./auth/guards/permissions.guard";
import { SchoolsModule } from "./schools/schools.module";
import { AcademicModule } from "./academic/academic.module";
import { GuardiansModule } from "./guardians/guardians.module";
import { StudentsModule } from "./students/students.module";
import { TeachersModule } from "./teachers/teachers.module";
import { HrModule } from "./hr/hr.module";
import { PromotionsModule } from "./promotions/promotions.module";
import { StudentLifecycleModule } from "./student-lifecycle/student-lifecycle.module";
import { TransfersModule } from "./transfers/transfers.module";
import { AttendanceModule } from "./attendance/attendance.module";
import { ExamsModule } from "./exams/exams.module";
import { FinanceModule } from "./finance/finance.module";
import { PayrollModule } from "./payroll/payroll.module";
import { StorageModule } from "./storage/storage.module";
import { DocumentsModule } from "./documents/documents.module";
import { AuditModule } from "./audit/audit.module";
import { DashboardModule } from "./dashboard/dashboard.module";
import { ImportsModule } from "./imports/imports.module";
import { ExportsModule } from "./exports/exports.module";
import { ReportsModule } from "./reports/reports.module";
import { AnnouncementsModule } from "./announcements/announcements.module";
import { NotificationsModule } from "./notifications/notifications.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),
    PrismaModule,
    RedisModule,
    HealthModule,
    AuthModule,
    TotpModule,
    SchoolsModule,
    AcademicModule,
    GuardiansModule,
    StudentsModule,
    TeachersModule,
    HrModule,
    PromotionsModule,
    StudentLifecycleModule,
    TransfersModule,
    AttendanceModule,
    ExamsModule,
    FinanceModule,
    PayrollModule,
    StorageModule,
    DocumentsModule,
    AuditModule,
    DashboardModule,
    ImportsModule,
    ExportsModule,
    ReportsModule,
    AnnouncementsModule,
    NotificationsModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    // Order matters: auth resolves req.user (or allows @Public through),
    // then permissions checks it. Every route is deny-by-default.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
  ],
})
export class AppModule {}
