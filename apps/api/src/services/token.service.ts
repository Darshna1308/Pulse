import { randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { unauthorized } from '../lib/errors.js';

const ISSUER = 'pulse-api';
const AUDIENCE = 'pulse-web';

export interface AccessClaims {
  userId: string;
  sessionId: string;
}

/** Short-lived HS256 access token bound to a server-side session. */
export function signAccessToken({ userId, sessionId }: AccessClaims): string {
  return jwt.sign({ sid: sessionId, typ: 'access' }, env().JWT_ACCESS_SECRET, {
    jwtid: randomUUID(),
    algorithm: 'HS256',
    subject: userId,
    issuer: ISSUER,
    audience: AUDIENCE,
    expiresIn: env().ACCESS_TOKEN_TTL_SECONDS,
  });
}

export function verifyAccessToken(token: string): AccessClaims {
  try {
    const payload = jwt.verify(token, env().JWT_ACCESS_SECRET, {
      algorithms: ['HS256'],
      issuer: ISSUER,
      audience: AUDIENCE,
    });
    if (typeof payload === 'string' || payload.typ !== 'access' || !payload.sub || typeof payload.sid !== 'string') {
      throw unauthorized('Invalid access token', 'invalid_token');
    }
    return { userId: payload.sub, sessionId: payload.sid };
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) throw unauthorized('Access token expired', 'token_expired');
    if (err instanceof jwt.JsonWebTokenError) throw unauthorized('Invalid access token', 'invalid_token');
    throw err;
  }
}
