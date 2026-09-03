import { AsyncLocalStorage } from "node:async_hooks";
import { randomBytes } from "node:crypto";
import type { NextFunction, Request, Response } from "express";

export interface RequestContext {
  ipAddress: string | null;
  userAgent: string | null;
  requestId: string;
}

// Lets AuditService.record() pick up the current request's IP/user-agent/
// requestId without every one of its ~30 callers having to thread an
// Express Request down through several service layers by hand — the
// middleware below populates this once per request, record() reads it.
export const requestContextStorage = new AsyncLocalStorage<RequestContext>();

// Render (like most PaaS) terminates TLS at a reverse proxy, so the real
// client address only shows up in X-Forwarded-For once Express's own
// "trust proxy" setting is enabled (see main.ts) — req.ip is otherwise the
// proxy's own address. The FIRST hop of X-Forwarded-For is the original
// client; every later hop is a proxy already between them and us, which we
// deliberately don't trust as "the actor's IP".
function extractIp(req: Request): string | null {
  const forwarded = req.headers["x-forwarded-for"];
  const first = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  if (typeof first === "string" && first.length > 0) {
    return first.split(",")[0]!.trim();
  }
  return req.ip ?? null;
}

export function requestContextMiddleware(req: Request, _res: Response, next: NextFunction) {
  const context: RequestContext = {
    ipAddress: extractIp(req),
    userAgent: typeof req.headers["user-agent"] === "string" ? req.headers["user-agent"] : null,
    requestId: `req_${randomBytes(8).toString("hex")}`,
  };
  requestContextStorage.run(context, next);
}
