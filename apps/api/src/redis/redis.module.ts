import { Global, Logger, Module } from "@nestjs/common";
import Redis from "ioredis";

export const REDIS_CLIENT = "REDIS_CLIENT";

const logger = new Logger("Redis");

@Global()
@Module({
  providers: [
    {
      provide: REDIS_CLIENT,
      useFactory: () => {
        const client = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379", {
          // Cap reconnect backoff instead of retrying a down Redis every
          // couple of seconds forever, and never let a command queue
          // indefinitely while disconnected — HealthController (the one
          // real caller today) should get a fast rejection, not a hang.
          retryStrategy: (times) => Math.min(times * 200, 10_000),
          maxRetriesPerRequest: 3,
        });
        // Without a listener here, a connection-level failure (Redis
        // unreachable, wrong URL, etc.) is an "unhandled error event" on
        // this EventEmitter — Node throws it as an uncaught exception,
        // which crashes the *entire* API process, not just this client.
        // Logging and swallowing it here means a Redis outage degrades to
        // exactly what HealthController already reports ("degraded"),
        // instead of taking every other in-flight request down with it.
        client.on("error", (err) => logger.error(`Redis connection error: ${err.message}`));
        return client;
      },
    },
  ],
  exports: [REDIS_CLIENT],
})
export class RedisModule {}
