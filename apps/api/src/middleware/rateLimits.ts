import type { Request, Response } from 'express';
import { rateLimit, type Options } from 'express-rate-limit';
import { env } from '../config/env.js';

function limiter(name: string, windowMs: number, limit: number, keyGenerator?: Options['keyGenerator']) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    keyGenerator,
    handler: (req: Request, res: Response) => {
      res.status(429).json({
        error: { code: 'rate_limited', message: 'Too many requests. Please slow down and retry later.', limiter: name, requestId: req.id },
      });
    },
  });
}

const ip = (req: Request) => req.ip ?? 'unknown';
const emailOf = (req: Request) => String((req.body as { email?: unknown } | undefined)?.email ?? '').toLowerCase().slice(0, 254);

/** Created per app instance so tests and multiple apps do not share counters. */
export function createRateLimiters() {
  return {
    login: limiter('login', 15 * 60_000, 10, (req) => `${ip(req)}|${emailOf(req)}`),
    register: limiter('register', 60 * 60_000, env().RATE_LIMIT_REGISTER_PER_HOUR, ip),
    refresh: limiter('refresh', 5 * 60_000, 60, ip),
    sensitive: limiter('sensitive', 15 * 60_000, 20, (req) => req.auth?.userId ?? ip(req)),
    api: limiter('api', 60_000, 600, ip),
    ingest: limiter('ingest', 60_000, 120, (req) => (req.apiKey ? `key:${String(req.apiKey._id)}` : ip(req))),
    evaluation: limiter('evaluation', 10 * 60_000, 5, (req) => req.auth?.userId ?? ip(req)),
  };
}

export type RateLimiters = ReturnType<typeof createRateLimiters>;
