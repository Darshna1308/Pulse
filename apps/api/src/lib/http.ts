import type { Request } from 'express';
import { z } from 'zod';
import { notFound } from './errors.js';

export const objectId = z.string().regex(/^[a-f0-9]{24}$/i);

/** Parse an ObjectId route parameter, answering 404 for malformed ids. */
export function idParam(req: Request, name: string, what = 'Resource'): string {
  const parsed = objectId.safeParse(req.params[name]);
  if (!parsed.success) throw notFound(what);
  return parsed.data;
}

export const pagination = z.object({
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

export function pageMeta(page: number, pageSize: number, total: number) {
  return { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
}

export const escapeRegex = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
