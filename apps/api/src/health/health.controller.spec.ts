import type Redis from "ioredis";
import { HealthController } from "./health.controller";
import { PrismaService } from "../prisma/prisma.service";

function build(redis: Partial<Redis> | null) {
  const prisma = { $queryRaw: jest.fn().mockResolvedValue([{ "?column?": 1 }]) };
  return new HealthController(prisma as unknown as PrismaService, redis as Redis | null);
}

describe("HealthController — Redis is optional", () => {
  it("reports ok with Redis not configured when no client exists (no REDIS_URL)", async () => {
    const result = await build(null).check();
    expect(result.status).toBe("ok");
    expect(result.redis).toEqual({ ok: true, configured: false });
  });

  it("reports ok when a configured Redis answers PONG", async () => {
    const result = await build({ ping: jest.fn().mockResolvedValue("PONG") }).check();
    expect(result).toMatchObject({ status: "ok", redis: { ok: true } });
  });

  it("reports degraded when a configured Redis is unreachable", async () => {
    const result = await build({ ping: jest.fn().mockRejectedValue(new Error("ECONNREFUSED")) }).check();
    expect(result).toMatchObject({ status: "degraded", redis: { ok: false, error: "ECONNREFUSED" } });
  });
});
