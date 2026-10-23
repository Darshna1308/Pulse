import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose';

export const REVOKE_REASONS = ['logout', 'user_revoked', 'reuse_detected', 'password_changed', 'expired'] as const;

/**
 * One refresh-token family. The current refresh secret is stored only as a SHA-256 hash;
 * hashes of rotated-out secrets are kept so that presenting one again is detected as
 * token reuse, which revokes the whole session.
 */
const sessionSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    refreshTokenHash: { type: String, required: true },
    previousTokenHashes: { type: [String], default: [] },
    userAgent: { type: String, maxlength: 256 },
    ipAddress: { type: String, maxlength: 64 },
    lastUsedAt: { type: Date, default: () => new Date() },
    idleExpiresAt: { type: Date, required: true },
    expiresAt: { type: Date, required: true },
    revokedAt: { type: Date },
    revokedReason: { type: String, enum: REVOKE_REASONS },
    rotationCount: { type: Number, default: 0 },
  },
  { timestamps: true },
);

// MongoDB removes session records a day after their absolute expiry.
sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 86_400 });

export type Session = InferSchemaType<typeof sessionSchema>;
export type SessionDoc = HydratedDocument<Session>;
export const SessionModel = model('Session', sessionSchema);
