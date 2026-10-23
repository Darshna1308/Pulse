import type { Request, Response } from 'express';
import { z } from 'zod';
import { idParam } from '../lib/http.js';
import * as keys from '../services/apiKey.service.js';

const createSchema = z.object({ name: z.string().trim().min(1, 'Name is required').max(80) }).strict();

export async function list(req: Request, res: Response) {
  res.json({ data: await keys.listApiKeys(req.project!) });
}

export async function create(req: Request, res: Response) {
  const { name } = createSchema.parse(req.body);
  const { apiKey, secret } = await keys.createApiKey(req.project!, req.auth!.userId, name);
  res.setHeader('Cache-Control', 'no-store');
  // The full key is returned exactly once. Only its HMAC is stored.
  res.status(201).json({ data: { apiKey, key: secret } });
}

export async function revoke(req: Request, res: Response) {
  res.json({ data: await keys.revokeApiKey(req.project!, idParam(req, 'keyId', 'API key')) });
}
