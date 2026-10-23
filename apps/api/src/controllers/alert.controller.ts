import type { Request, Response } from 'express';
import { z } from 'zod';
import { idParam, pagination } from '../lib/http.js';
import { ALERT_STATUSES } from '../models/alert.model.js';
import { SEVERITIES } from '../models/apiEvent.model.js';
import * as alerts from '../services/alert.service.js';

const listSchema = pagination.extend({
  status: z.enum([...ALERT_STATUSES, 'active']).optional(),
  severity: z.enum(SEVERITIES).optional(),
});
const updateSchema = z.object({ status: z.enum(ALERT_STATUSES), note: z.string().trim().max(1000).optional() }).strict();

export async function list(req: Request, res: Response) {
  const { items, meta } = await alerts.listAlerts(req.project!, listSchema.parse(req.query));
  res.json({ data: items, meta });
}

export async function get(req: Request, res: Response) {
  res.json({ data: await alerts.getAlert(req.project!, idParam(req, 'alertId', 'Alert')) });
}

export async function updateStatus(req: Request, res: Response) {
  const body = updateSchema.parse(req.body);
  res.json({ data: await alerts.updateAlertStatus(req.project!, idParam(req, 'alertId', 'Alert'), req.auth!.userId, body) });
}
