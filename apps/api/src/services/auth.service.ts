import { Types } from 'mongoose';
import { env } from '../config/env.js';
import { randomToken, sha256 } from '../lib/crypto.js';
import { conflict, notFound, unauthorized } from '../lib/errors.js';
import { logger } from '../lib/logger.js';
import { SessionModel, type SessionDoc } from '../models/session.model.js';
import { UserModel, publicUser, type UserDoc } from '../models/user.model.js';
import { burnPasswordCheck, hashPassword, verifyPassword } from './password.service.js';
import { signAccessToken } from './token.service.js';

const DAY_MS = 86_400_000;
const MAX_PREVIOUS_HASHES = 20;

export interface ClientMeta {
  userAgent?: string;
  ipAddress?: string;
}

export interface AuthResult {
  user: ReturnType<typeof publicUser>;
  accessToken: string;
  refreshToken: string;
  sessionId: string;
  refreshExpiresAt: Date;
}

/** Refresh tokens are "<sessionId>.<secret>"; only sha256(secret) is stored. */
function parseRefreshToken(raw: string | undefined): { sessionId: string; secret: string } {
  const match = /^([a-f0-9]{24})\.([A-Za-z0-9_-]{43})$/.exec(raw ?? '');
  if (!match) throw unauthorized('Invalid refresh token', 'invalid_refresh_token');
  return { sessionId: match[1]!, secret: match[2]! };
}

function issue(user: UserDoc, session: SessionDoc, secret: string): AuthResult {
  return {
    user: publicUser(user),
    accessToken: signAccessToken({ userId: String(user._id), sessionId: String(session._id) }),
    refreshToken: `${String(session._id)}.${secret}`,
    sessionId: String(session._id),
    refreshExpiresAt: session.expiresAt,
  };
}

async function startSession(user: UserDoc, meta: ClientMeta): Promise<AuthResult> {
  const now = Date.now();
  const secret = randomToken(32);
  const session = await SessionModel.create({
    userId: user._id,
    refreshTokenHash: sha256(secret),
    userAgent: meta.userAgent?.slice(0, 256),
    ipAddress: meta.ipAddress?.slice(0, 64),
    idleExpiresAt: new Date(now + env().REFRESH_IDLE_TIMEOUT_DAYS * DAY_MS),
    expiresAt: new Date(now + env().REFRESH_TOKEN_TTL_DAYS * DAY_MS),
  });
  return issue(user, session, secret);
}

export async function register(input: { email: string; password: string; name: string }, meta: ClientMeta) {
  if (await UserModel.exists({ email: input.email })) {
    throw conflict('An account with this email already exists', 'email_taken');
  }
  let user: UserDoc;
  try {
    user = await UserModel.create({ email: input.email, name: input.name, passwordHash: await hashPassword(input.password) });
  } catch (err) {
    if ((err as { code?: number }).code === 11000) throw conflict('An account with this email already exists', 'email_taken');
    throw err;
  }
  return startSession(user, meta);
}

export async function login(input: { email: string; password: string }, meta: ClientMeta) {
  const user = await UserModel.findOne({ email: input.email }).select('+passwordHash');
  if (!user) {
    await burnPasswordCheck(input.password);
    throw unauthorized('Invalid email or password', 'invalid_credentials');
  }
  if (!(await verifyPassword(user.passwordHash, input.password))) {
    throw unauthorized('Invalid email or password', 'invalid_credentials');
  }
  user.lastLoginAt = new Date();
  await user.save();
  return startSession(user, meta);
}

async function revoke(sessionId: string | Types.ObjectId, reason: NonNullable<SessionDoc['revokedReason']>) {
  await SessionModel.updateOne({ _id: sessionId, revokedAt: { $exists: false } }, { $set: { revokedAt: new Date(), revokedReason: reason } });
}

/**
 * Rotate a refresh token. Presenting an already-rotated token is treated as theft:
 * the whole session (token family) is revoked and both parties must sign in again.
 */
export async function refresh(rawToken: string | undefined, meta: ClientMeta): Promise<AuthResult> {
  const { sessionId, secret } = parseRefreshToken(rawToken);
  const session = await SessionModel.findById(sessionId);
  if (!session || session.revokedAt) throw unauthorized('Session is no longer valid', 'invalid_refresh_token');

  const now = Date.now();
  if (session.expiresAt.getTime() <= now || session.idleExpiresAt.getTime() <= now) {
    await revoke(session._id, 'expired');
    throw unauthorized('Session expired', 'session_expired');
  }

  const presented = sha256(secret);
  if (presented !== session.refreshTokenHash) {
    if (session.previousTokenHashes.includes(presented)) {
      await revoke(session._id, 'reuse_detected');
      logger.warn({ sessionId, userId: String(session.userId) }, 'Refresh token reuse detected; session revoked');
      throw unauthorized('Refresh token reuse detected. Please sign in again.', 'refresh_token_reused');
    }
    throw unauthorized('Invalid refresh token', 'invalid_refresh_token');
  }

  const nextSecret = randomToken(32);
  const updated = await SessionModel.findOneAndUpdate(
    { _id: session._id, refreshTokenHash: presented, revokedAt: { $exists: false } },
    {
      $set: {
        refreshTokenHash: sha256(nextSecret),
        lastUsedAt: new Date(now),
        idleExpiresAt: new Date(Math.min(now + env().REFRESH_IDLE_TIMEOUT_DAYS * DAY_MS, session.expiresAt.getTime())),
        ...(meta.userAgent ? { userAgent: meta.userAgent.slice(0, 256) } : {}),
        ...(meta.ipAddress ? { ipAddress: meta.ipAddress.slice(0, 64) } : {}),
      },
      $push: { previousTokenHashes: { $each: [presented], $slice: -MAX_PREVIOUS_HASHES } },
      $inc: { rotationCount: 1 },
    },
    { new: true },
  );
  if (!updated) {
    // Another request rotated this token first: the same secret was used twice.
    await revoke(session._id, 'reuse_detected');
    throw unauthorized('Refresh token reuse detected. Please sign in again.', 'refresh_token_reused');
  }
  const user = await UserModel.findById(updated.userId);
  if (!user) throw unauthorized('Session is no longer valid', 'invalid_refresh_token');
  return issue(user, updated, nextSecret);
}

/** Revoke the session behind a refresh token. Unknown or malformed tokens are ignored. */
export async function logout(rawToken: string | undefined): Promise<void> {
  try {
    const { sessionId, secret } = parseRefreshToken(rawToken);
    const session = await SessionModel.findById(sessionId);
    const hash = sha256(secret);
    if (session && (session.refreshTokenHash === hash || session.previousTokenHashes.includes(hash))) {
      await revoke(session._id, 'logout');
    }
  } catch {
    /* logging out with a bad token is a no-op */
  }
}

export async function getUser(userId: string) {
  const user = await UserModel.findById(userId);
  if (!user) throw unauthorized('Account not found', 'invalid_token');
  return publicUser(user);
}

export async function listSessions(userId: string, currentSessionId: string) {
  const sessions = await SessionModel.find({
    userId,
    revokedAt: { $exists: false },
    expiresAt: { $gt: new Date() },
    idleExpiresAt: { $gt: new Date() },
  }).sort({ lastUsedAt: -1 });
  return sessions.map((s) => ({
    id: String(s._id),
    userAgent: s.userAgent ?? null,
    ipAddress: s.ipAddress ?? null,
    createdAt: s.createdAt,
    lastUsedAt: s.lastUsedAt,
    expiresAt: s.expiresAt,
    current: String(s._id) === currentSessionId,
  }));
}

export async function revokeSession(userId: string, sessionId: string) {
  const result = await SessionModel.updateOne(
    { _id: sessionId, userId, revokedAt: { $exists: false } },
    { $set: { revokedAt: new Date(), revokedReason: 'user_revoked' } },
  );
  if (result.matchedCount === 0) throw notFound('Session');
}

export async function revokeOtherSessions(userId: string, currentSessionId: string) {
  const result = await SessionModel.updateMany(
    { userId, _id: { $ne: currentSessionId }, revokedAt: { $exists: false } },
    { $set: { revokedAt: new Date(), revokedReason: 'user_revoked' } },
  );
  return result.modifiedCount;
}

export async function changePassword(userId: string, currentSessionId: string, current: string, next: string) {
  const user = await UserModel.findById(userId).select('+passwordHash');
  if (!user || !(await verifyPassword(user.passwordHash, current))) {
    throw unauthorized('Current password is incorrect', 'invalid_credentials');
  }
  user.passwordHash = await hashPassword(next);
  user.passwordChangedAt = new Date();
  await user.save();
  await SessionModel.updateMany(
    { userId, _id: { $ne: currentSessionId }, revokedAt: { $exists: false } },
    { $set: { revokedAt: new Date(), revokedReason: 'password_changed' } },
  );
}
