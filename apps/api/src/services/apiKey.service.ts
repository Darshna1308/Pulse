import { randomBytes } from 'node:crypto';
import { env } from '../config/env.js';
import { hmacSha256, randomToken, safeEqual } from '../lib/crypto.js';
import { notFound, unauthorized } from '../lib/errors.js';
import { API_KEY_PREFIX, ApiKeyModel, publicApiKey, type ApiKeyDoc } from '../models/apiKey.model.js';
import { ProjectModel, type ProjectDoc } from '../models/project.model.js';

const KEY_PATTERN = /^pulse_([a-f0-9]{12})_([A-Za-z0-9_-]{43})$/;
const LAST_USED_RESOLUTION_MS = 60_000;

const hashSecret = (secret: string) => hmacSha256(env().API_KEY_PEPPER, secret);

/**
 * Create a key of the form pulse_<keyId>_<secret>. keyId (48 random bits) is a public
 * lookup handle; the 256-bit secret is returned once and stored only as an HMAC.
 */
export async function createApiKey(project: ProjectDoc, userId: string, name: string) {
  const keyId = randomBytes(6).toString('hex');
  const secret = randomToken(32);
  const key = await ApiKeyModel.create({
    projectId: project._id,
    createdBy: userId,
    name,
    keyId,
    secretHash: hashSecret(secret),
    scopes: ['events:write'],
  });
  return { apiKey: publicApiKey(key), secret: `${API_KEY_PREFIX}_${keyId}_${secret}` };
}

export async function listApiKeys(project: ProjectDoc) {
  const keys = await ApiKeyModel.find({ projectId: project._id }).sort({ revokedAt: 1, createdAt: -1 });
  return keys.map(publicApiKey);
}

export async function revokeApiKey(project: ProjectDoc, keyId: string) {
  const key = await ApiKeyModel.findOne({ _id: keyId, projectId: project._id });
  if (!key) throw notFound('API key');
  if (!key.revokedAt) {
    key.revokedAt = new Date();
    await key.save();
  }
  return publicApiKey(key);
}

export async function authenticateApiKey(raw: string): Promise<{ key: ApiKeyDoc; project: ProjectDoc }> {
  const match = KEY_PATTERN.exec(raw.trim());
  const invalid = unauthorized('Invalid API key', 'invalid_api_key');
  if (!match) throw invalid;
  const key = await ApiKeyModel.findOne({ keyId: match[1] }).select('+secretHash');
  if (!key || !safeEqual(key.secretHash, hashSecret(match[2]!))) throw invalid;
  if (key.revokedAt) throw unauthorized('API key has been revoked', 'api_key_revoked');
  const project = await ProjectModel.findById(key.projectId);
  if (!project) throw invalid;

  const now = Date.now();
  if (!key.lastUsedAt || now - key.lastUsedAt.getTime() > LAST_USED_RESOLUTION_MS) {
    await ApiKeyModel.updateOne({ _id: key._id }, { $set: { lastUsedAt: new Date(now) } });
    key.lastUsedAt = new Date(now);
  }
  return { key, project };
}
