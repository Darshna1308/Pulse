import type { Request, Response } from 'express';
import { idParam } from '../lib/http.js';
import { eventQuerySchema, getEvent, listEvents } from '../services/event.service.js';
import { ingestBodySchema, ingestEvents, reprocessFailed } from '../services/ingestion.service.js';

/** Key-authenticated ingestion. 201 when scored; 202 when stored but scoring must be retried. */
export async function ingest(req: Request, res: Response) {
  const { events } = ingestBodySchema.parse(req.body);
  const result = await ingestEvents(req.project!, events, { source: 'api_key', apiKeyId: req.apiKey!._id });
  const status = result.score?.status === 'ml_unavailable' ? 202 : result.accepted ? 201 : 200;
  res.status(status).json({ data: result });
}

export async function list(req: Request, res: Response) {
  const { items, meta } = await listEvents(req.project!, eventQuerySchema.parse(req.query));
  res.json({ data: items, meta });
}

export async function get(req: Request, res: Response) {
  res.json({ data: await getEvent(req.project!, idParam(req, 'eventId', 'Event')) });
}

export async function reprocess(req: Request, res: Response) {
  const result = await reprocessFailed(req.project!);
  res.status(result.score?.status === 'ml_unavailable' ? 202 : 200).json({ data: result });
}
