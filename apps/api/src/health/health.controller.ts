import { Controller, Get, Inject } from "@nestjs/common";
import type Redis from "ioredis";
import { PrismaService } from "../prisma/prisma.service";
import { REDIS_CLIENT } from "../redis/redis.module";
import { Public } from "../auth/decorators/public.decorator";

@Controller("health")
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis | null,
  ) {}

  @Public()
  @Get()
  async check() {
    const [database, redis] = await Promise.all([this.checkDatabase(), this.checkRedis()]);
    return {
      status: database.ok && redis.ok ? "ok" : "degraded",
      database,
      redis,
      timestamp: new Date().toISOString(),
    };
  }

  private async checkDatabase() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { ok: true };
    } catch (error) {
      return { ok: false, error: (error as Error).message };
    }
  }

  // Not configured is not a failure: Redis is optional (see RedisModule).
  private async checkRedis() {
    if (!this.redis) return { ok: true, configured: false };
    try {
      const pong = await this.redis.ping();
      return { ok: pong === "PONG" };
    } catch (error) {
      return { ok: false, error: (error as Error).message };
    }
  }
}
