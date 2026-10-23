import type { RequestHandler } from 'express';
import { unauthorized } from '../lib/errors.js';
import { SessionModel } from '../models/session.model.js';
import { verifyAccessToken } from '../services/token.service.js';

/**
 * Bearer access-token authentication. The token's session is also checked so that
 * logout and session revocation take effect immediately, not when the JWT expires.
 */
export const authenticate: RequestHandler = async (req, _res, next) => {
  const header = req.get('authorization') ?? '';
  const [scheme, token] = header.split(' ');
  if (scheme?.toLowerCase() !== 'bearer' || !token) throw unauthorized();

  const claims = verifyAccessToken(token);
  const session = await SessionModel.findById(claims.sessionId).select('userId revokedAt expiresAt').lean();
  if (!session || session.revokedAt || String(session.userId) !== claims.userId || session.expiresAt <= new Date()) {
    throw unauthorized('Session is no longer valid', 'session_revoked');
  }
  req.auth = claims;
  next();
};
