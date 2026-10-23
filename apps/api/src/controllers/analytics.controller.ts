import type { Request, Response } from 'express';
import { z } from 'zod';
import { RANGES, overview, scoreDistribution, type RangeKey } from '../services/analytics.service.js';

const rangeSchema = z.object({ range: z.enum(Object.keys(RANGES) as [RangeKey, ...RangeKey[]]).default('24h') });

export async function getOverview(req: Request, res: Response) {
  const { range } = rangeSchema.parse(req.query);
  res.json({ data: await overview(req.project!, range) });
}

export async function getScoreDistribution(req: Request, res: Response) {
  const { range } = rangeSchema.parse(req.query);
  res.json({ data: await scoreDistribution(req.project!, range) });
}
