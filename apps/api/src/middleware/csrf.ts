import type { RequestHandler } from 'express';
import { env } from '../config/env.js';
import { safeEqual } from '../lib/crypto.js';
import { forbidden } from '../lib/errors.js';

export const CSRF_COOKIE = 'pulse_csrf';
export const CSRF_HEADER = 'x-csrf-token';

/**
 * Reject browser requests from origins we do not serve. Applied to every auth
 * endpoint, which also prevents login CSRF. Requests without an Origin header
 * (curl, server-to-server) are allowed here and must pass other checks.
 */
export const requireAllowedOrigin: RequestHandler = (req, _res, next) => {
  const origin = req.get('origin');
  if (origin && !env().corsOrigins.includes(origin)) throw forbidden('Origin not allowed', 'origin_not_allowed');
  next();
};

/**
 * Double-submit CSRF check for the cookie-authenticated endpoints (refresh, logout).
 * The refresh cookie is HttpOnly + SameSite=Strict; additionally the client must echo
 * the readable pulse_csrf cookie in the X-CSRF-Token header, which a cross-site page
 * cannot read or forge.
 */
export const requireCsrf: RequestHandler = (req, _res, next) => {
  const cookie = req.cookies?.[CSRF_COOKIE];
  const header = req.get(CSRF_HEADER);
  if (typeof cookie !== 'string' || !header || !safeEqual(cookie, header)) {
    throw forbidden('Missing or invalid CSRF token', 'csrf_failed');
  }
  next();
};
