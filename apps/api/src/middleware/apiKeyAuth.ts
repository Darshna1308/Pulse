import type { RequestHandler } from 'express';
import { forbidden, unauthorized } from '../lib/errors.js';
import { authenticateApiKey } from '../services/apiKey.service.js';

export const API_KEY_HEADER = 'x-pulse-key';

/** Authenticate ingestion requests with a project API key and require a scope. */
export function apiKeyAuth(scope: string): RequestHandler {
  return async (req, _res, next) => {
    const raw = req.get(API_KEY_HEADER);
    if (!raw) throw unauthorized('Missing X-Pulse-Key header', 'missing_api_key');
    const { key, project } = await authenticateApiKey(raw);
    if (!key.scopes.includes(scope as never)) throw forbidden(`API key lacks the ${scope} scope`, 'insufficient_scope');
    req.apiKey = key;
    req.project = project;
    next();
  };
}
