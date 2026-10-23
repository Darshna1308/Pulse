import { z } from 'zod';
import { notFound } from '../lib/errors.js';
import { escapeRegex, pageMeta, pagination } from '../lib/http.js';
import { AlertModel } from '../models/alert.model.js';
import { ApiEventModel, HTTP_METHODS, PROCESSING_STATUSES, publicEvent } from '../models/apiEvent.model.js';
import type { ProjectDoc } from '../models/project.model.js';

export const eventQuerySchema = pagination.extend({
  method: z.enum(HTTP_METHODS).optional(),
  statusClass: z.enum(['2xx', '3xx', '4xx', '5xx']).optional(),
  route: z.string().max(200).optional(),
  clientId: z.string().max(128).optional(),
  anomaly: z.enum(['true', 'false']).optional(),
  processing: z.enum(PROCESSING_STATUSES).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

export async function listEvents(project: ProjectDoc, q: z.infer<typeof eventQuerySchema>) {
  const filter: Record<string, unknown> = { projectId: project._id };
  if (q.method) filter.method = q.method;
  if (q.statusClass) {
    const base = Number(q.statusClass[0]) * 100;
    filter.statusCode = { $gte: base, $lt: base + 100 };
  }
  if (q.route?.trim()) filter.route = { $regex: escapeRegex(q.route.trim()), $options: 'i' };
  if (q.clientId?.trim()) filter.clientId = q.clientId.trim();
  if (q.anomaly === 'true') filter['prediction.isAnomaly'] = true;
  if (q.anomaly === 'false') filter['prediction.isAnomaly'] = { $ne: true };
  if (q.processing) filter['processing.status'] = q.processing;
  if (q.from || q.to) {
    filter.timestamp = { ...(q.from ? { $gte: q.from } : {}), ...(q.to ? { $lte: q.to } : {}) };
  }

  const [items, total] = await Promise.all([
    ApiEventModel.find(filter)
      .sort({ timestamp: -1, _id: -1 })
      .skip((q.page - 1) * q.pageSize)
      .limit(q.pageSize),
    ApiEventModel.countDocuments(filter),
  ]);
  return { items: items.map(publicEvent), meta: pageMeta(q.page, q.pageSize, total) };
}

export async function getEvent(project: ProjectDoc, eventId: string) {
  const event = await ApiEventModel.findOne({ _id: eventId, projectId: project._id });
  if (!event) throw notFound('Event');
  const alert = event.alertId
    ? await AlertModel.findOne({ _id: event.alertId, projectId: project._id }).select('title status severity')
    : null;
  return {
    event: publicEvent(event),
    alert: alert ? { id: String(alert._id), title: alert.title, status: alert.status, severity: alert.severity } : null,
  };
}
