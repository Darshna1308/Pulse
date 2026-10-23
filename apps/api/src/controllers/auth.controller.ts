import type { CookieOptions, Request, Response } from 'express';
import { z } from 'zod';
import { env } from '../config/env.js';
import { randomToken } from '../lib/crypto.js';
import { idParam } from '../lib/http.js';
import { CSRF_COOKIE } from '../middleware/csrf.js';
import * as auth from '../services/auth.service.js';

export const REFRESH_COOKIE = 'pulse_rt';
const REFRESH_PATH = '/api/v1/auth';

const email = z.string().trim().toLowerCase().email('Enter a valid email address').max(254);
const password = z
  .string()
  .min(10, 'Password must be at least 10 characters')
  .max(128, 'Password must be at most 128 characters')
  .refine((p) => /[A-Za-z]/.test(p) && /\d/.test(p), 'Password must contain at least one letter and one number');

const registerSchema = z.object({ email, password, name: z.string().trim().min(1, 'Name is required').max(80) }).strict();
const loginSchema = z.object({ email, password: z.string().min(1).max(128) }).strict();
const passwordSchema = z.object({ currentPassword: z.string().min(1).max(128), newPassword: password }).strict();

const meta = (req: Request): auth.ClientMeta => ({ userAgent: req.get('user-agent'), ipAddress: req.ip });

function cookieBase(): CookieOptions {
  return { secure: env().cookieSecure, sameSite: 'strict' };
}

function sendSession(res: Response, result: auth.AuthResult, status = 200) {
  const csrfToken = randomToken(24);
  res.cookie(REFRESH_COOKIE, result.refreshToken, {
    ...cookieBase(),
    httpOnly: true,
    path: REFRESH_PATH,
    expires: result.refreshExpiresAt,
  });
  // Readable by the SPA so it can echo it in X-CSRF-Token (double-submit pattern).
  res.cookie(CSRF_COOKIE, csrfToken, { ...cookieBase(), httpOnly: false, path: '/', expires: result.refreshExpiresAt });
  res.setHeader('Cache-Control', 'no-store');
  res.status(status).json({
    data: {
      user: result.user,
      accessToken: result.accessToken,
      accessTokenExpiresIn: env().ACCESS_TOKEN_TTL_SECONDS,
      csrfToken,
    },
  });
}

function clearSession(res: Response) {
  res.clearCookie(REFRESH_COOKIE, { ...cookieBase(), httpOnly: true, path: REFRESH_PATH });
  res.clearCookie(CSRF_COOKIE, { ...cookieBase(), path: '/' });
}

export async function register(req: Request, res: Response) {
  const body = registerSchema.parse(req.body);
  sendSession(res, await auth.register(body, meta(req)), 201);
}

export async function login(req: Request, res: Response) {
  const body = loginSchema.parse(req.body);
  sendSession(res, await auth.login(body, meta(req)));
}

export async function refresh(req: Request, res: Response) {
  try {
    sendSession(res, await auth.refresh(req.cookies?.[REFRESH_COOKIE], meta(req)));
  } catch (err) {
    clearSession(res);
    throw err;
  }
}

export async function logout(req: Request, res: Response) {
  await auth.logout(req.cookies?.[REFRESH_COOKIE]);
  clearSession(res);
  res.status(204).end();
}

export async function me(req: Request, res: Response) {
  res.json({ data: { user: await auth.getUser(req.auth!.userId), sessionId: req.auth!.sessionId } });
}

export async function sessions(req: Request, res: Response) {
  res.json({ data: await auth.listSessions(req.auth!.userId, req.auth!.sessionId) });
}

export async function revokeSession(req: Request, res: Response) {
  await auth.revokeSession(req.auth!.userId, idParam(req, 'sessionId', 'Session'));
  res.status(204).end();
}

export async function revokeOtherSessions(req: Request, res: Response) {
  const revoked = await auth.revokeOtherSessions(req.auth!.userId, req.auth!.sessionId);
  res.json({ data: { revoked } });
}

export async function changePassword(req: Request, res: Response) {
  const body = passwordSchema.parse(req.body);
  await auth.changePassword(req.auth!.userId, req.auth!.sessionId, body.currentPassword, body.newPassword);
  res.json({ data: { changed: true } });
}
