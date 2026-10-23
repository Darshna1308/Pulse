import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose';

export const API_KEY_SCOPES = ['events:write'] as const;

const apiKeySchema = new Schema(
  {
    projectId: { type: Schema.Types.ObjectId, ref: 'Project', required: true, index: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    name: { type: String, required: true, trim: true, maxlength: 80 },
    /** Public identifier embedded in the key, used for lookup. Not secret. */
    keyId: { type: String, required: true, unique: true },
    /** HMAC-SHA256 of the secret part with a server-side pepper. The secret is never stored. */
    secretHash: { type: String, required: true, select: false },
    scopes: { type: [String], enum: API_KEY_SCOPES, default: ['events:write'] },
    lastUsedAt: { type: Date },
    revokedAt: { type: Date },
  },
  { timestamps: true },
);

export type ApiKey = InferSchemaType<typeof apiKeySchema>;
export type ApiKeyDoc = HydratedDocument<ApiKey>;
export const ApiKeyModel = model('ApiKey', apiKeySchema);

export const API_KEY_PREFIX = 'pulse';

export function publicApiKey(k: ApiKeyDoc) {
  return {
    id: String(k._id),
    name: k.name,
    prefix: `${API_KEY_PREFIX}_${k.keyId}_`,
    scopes: k.scopes,
    createdAt: k.createdAt,
    lastUsedAt: k.lastUsedAt ?? null,
    revokedAt: k.revokedAt ?? null,
    status: k.revokedAt ? 'revoked' : 'active',
  };
}
