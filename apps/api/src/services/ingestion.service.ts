import { Types } from 'mongoose';
import { z } from 'zod';
import { logger } from '../lib/logger.js';
import { ApiEventModel, HTTP_METHODS, type ApiEventDoc } from '../models/apiEvent.model.js';
import { ModelVersionModel } from '../models/modelVersion.model.js';
import type { ProjectDoc } from '../models/project.model.js';
import { recordAnomalies } from './alert.service.js';
import { computeContext, type EventContext } from './context.service.js';
import { MlUnavailableError, mlClient, type MlEvent } from './ml.client.js';

export const MAX_BATCH = 100;
const ML_CHUNK = 200;
const CONTEXT_CONCURRENCY = 8;
const MAX_AGE_MS = 30 * 86_400_000;
const MAX_FUTURE_SKEW_MS = 5 * 60_000;

/**
 * Ingestion schema. It is strict: unknown fields (headers, bodies, tokens, query
 * strings) are rejected, so secrets cannot be stored by accident.
 */
export const ingestEventSchema = z
  .object({
    id: z
      .string()
      .min(1)
      .max(128)
      .regex(/^[A-Za-z0-9._:-]+$/, 'id may contain letters, digits and . _ : -')
      .optional()
      .describe('Client-generated idempotency key; repeated ids are not stored twice'),
    timestamp: z.coerce
      .date()
      .refine((d) => d.getTime() <= Date.now() + MAX_FUTURE_SKEW_MS, 'timestamp is in the future')
      .refine((d) => d.getTime() >= Date.now() - MAX_AGE_MS, 'timestamp is older than 30 days'),
    method: z
      .string()
      .transform((m) => m.toUpperCase())
      .pipe(z.enum(HTTP_METHODS)),
    route: z
      .string()
      .min(1)
      .max(512)
      .startsWith('/', 'route must start with /')
      .refine((r) => !r.includes('?') && !r.includes('#'), 'route must be a path template without query string'),
    statusCode: z.number().int().min(100).max(599),
    latencyMs: z.number().min(0).max(3_600_000),
    requestBytes: z.number().int().min(0).max(10_000_000_000).default(0),
    responseBytes: z.number().int().min(0).max(10_000_000_000).default(0),
    clientId: z
      .string()
      .min(1)
      .max(128)
      .regex(/^[\x21-\x7e]+$/, 'clientId must be printable ASCII without spaces'),
  })
  .strict();

export const ingestBodySchema = z.union([
  z.object({ events: z.array(ingestEventSchema).min(1).max(MAX_BATCH) }).strict(),
  ingestEventSchema.transform((e) => ({ events: [e] })),
]);

export type IngestEvent = z.infer<typeof ingestEventSchema>;

export interface IngestOptions {
  source: 'api_key' | 'demo';
  apiKeyId?: Types.ObjectId;
  simulatedScenarios?: (string | undefined)[];
}

export interface ScoreSummary {
  status: 'scored' | 'ml_unavailable';
  scored: number;
  failed: number;
  anomalies: number;
  alertsCreated: number;
  alertsUpdated: number;
  modelVersion: string | null;
  retryable: boolean;
  reason?: string;
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]!);
      }
    }),
  );
  return out;
}

const toMlEvent = (e: ApiEventDoc, c: EventContext): MlEvent => ({
  method: e.method,
  route: e.route,
  status_code: e.statusCode,
  latency_ms: e.latencyMs,
  request_bytes: e.requestBytes ?? 0,
  response_bytes: e.responseBytes ?? 0,
  timestamp: e.timestamp.toISOString(),
  client_id: e.clientId,
  context: {
    client_requests_1m: c.clientRequests1m,
    client_requests_5m: c.clientRequests5m,
    client_errors_5m: c.clientErrors5m,
    client_auth_failures_5m: c.clientAuthFailures5m,
    client_distinct_routes_5m: c.clientDistinctRoutes5m,
    route_latency_baseline_ms: c.routeLatencyBaselineMs,
    route_request_bytes_baseline: c.routeRequestBytesBaseline,
    route_response_bytes_baseline: c.routeResponseBytesBaseline,
  },
});

/**
 * Compute context, call the ML service and persist predictions and alerts. If the ML
 * service is unavailable, events are marked failed (retryable) and nothing is invented.
 */
export async function scoreEvents(project: ProjectDoc, events: ApiEventDoc[]): Promise<ScoreSummary> {
  const summary: ScoreSummary = {
    status: 'scored',
    scored: 0,
    failed: 0,
    anomalies: 0,
    alertsCreated: 0,
    alertsUpdated: 0,
    modelVersion: null,
    retryable: false,
  };
  const ordered = [...events].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

  for (let i = 0; i < ordered.length; i += ML_CHUNK) {
    const chunk = ordered.slice(i, i + ML_CHUNK);
    const contexts = await mapLimit(chunk, CONTEXT_CONCURRENCY, (e) =>
      computeContext({ projectId: project._id, clientId: e.clientId, method: e.method, route: e.route, timestamp: e.timestamp }),
    );

    let response;
    try {
      response = await mlClient.predict(chunk.map((e, k) => toMlEvent(e, contexts[k]!)));
    } catch (err) {
      if (!(err instanceof MlUnavailableError)) throw err;
      const rest = ordered.slice(i);
      await ApiEventModel.updateMany(
        { _id: { $in: rest.map((e) => e._id) } },
        { $set: { 'processing.status': 'failed', 'processing.error': err.reason }, $inc: { 'processing.attempts': 1 } },
      );
      logger.warn({ projectId: String(project._id), count: rest.length, reason: err.reason }, 'Scoring failed; events marked retryable');
      return { ...summary, status: 'ml_unavailable', failed: rest.length, retryable: true, reason: err.reason };
    }

    const scored = chunk.map((event, k) => ({
      event,
      prediction: response.predictions[k]!,
      modelVersion: response.model_version,
      threshold: response.threshold,
    }));
    const alerts = await recordAnomalies(project, scored);
    const now = new Date();

    const updates = scored.map(({ event, prediction }, k) => ({
        updateOne: {
          filter: { _id: event._id },
          update: {
            $set: {
              context: contexts[k],
              prediction: {
                score: prediction.anomaly_score,
                isAnomaly: prediction.is_anomaly,
                severity: prediction.severity,
                percentile: prediction.percentile,
                detectedBy: prediction.detected_by,
                modelVersion: response.model_version,
                threshold: response.threshold,
                patternCode: prediction.is_anomaly ? prediction.pattern?.code : undefined,
                patternTitle: prediction.is_anomaly ? prediction.pattern?.title : undefined,
              },
              'processing.status': 'scored',
              'processing.scoredAt': now,
              ...(event.alertId ? { alertId: event.alertId } : {}),
            },
            $unset: { 'processing.error': '' },
            $inc: { 'processing.attempts': 1 },
          },
        },
      }));
    // Dotted update paths are valid but trip mongoose's inferred types (custom timestamp names).
    await ApiEventModel.bulkWrite(updates as unknown as Parameters<typeof ApiEventModel.bulkWrite>[0], { ordered: false });

    await ModelVersionModel.updateOne(
      { version: response.model_version },
      {
        $set: { threshold: response.threshold, lastSeenAt: now },
        $setOnInsert: { firstSeenAt: now },
        $inc: { predictions: chunk.length },
      },
      { upsert: true },
    );

    summary.scored += chunk.length;
    summary.anomalies += scored.filter((s) => s.prediction.is_anomaly).length;
    summary.alertsCreated += alerts.created;
    summary.alertsUpdated += alerts.updated;
    summary.modelVersion = response.model_version;
  }
  return summary;
}

/** Store a batch idempotently, then score it. */
export async function ingestEvents(project: ProjectDoc, inputs: IngestEvent[], opts: IngestOptions) {
  const seen = new Set<string>();
  const ids = inputs.map((i) => i.id).filter((id): id is string => !!id);
  const existing = ids.length
    ? await ApiEventModel.find({ projectId: project._id, externalId: { $in: ids } }).select('externalId')
    : [];
  existing.forEach((e) => seen.add(e.externalId!));

  let duplicates = 0;
  const docs: Record<string, unknown>[] = [];
  inputs.forEach((input, idx) => {
    if (input.id) {
      if (seen.has(input.id)) {
        duplicates += 1;
        return;
      }
      seen.add(input.id);
    }
    docs.push({
      projectId: project._id,
      externalId: input.id,
      timestamp: input.timestamp,
      method: input.method,
      route: input.route,
      statusCode: input.statusCode,
      latencyMs: input.latencyMs,
      requestBytes: input.requestBytes,
      responseBytes: input.responseBytes,
      clientId: input.clientId,
      source: opts.source,
      apiKeyId: opts.apiKeyId,
      simulatedScenario: opts.simulatedScenarios?.[idx],
      processing: { status: 'pending', attempts: 0 },
    });
  });

  let inserted: ApiEventDoc[] = [];
  if (docs.length) {
    try {
      inserted = (await ApiEventModel.insertMany(docs, { ordered: false })) as unknown as ApiEventDoc[];
    } catch (err) {
      // A concurrent request stored the same idempotency key first.
      const e = err as { code?: number; insertedDocs?: ApiEventDoc[]; writeErrors?: unknown[] };
      if (e.code !== 11000 && !e.writeErrors) throw err;
      inserted = e.insertedDocs ?? [];
      duplicates += docs.length - inserted.length;
    }
  }

  const score = inserted.length ? await scoreEvents(project, inserted) : null;
  const stored = inserted.length
    ? await ApiEventModel.find({ _id: { $in: inserted.map((e) => e._id) } })
        .select('externalId timestamp processing.status prediction.score prediction.isAnomaly prediction.severity alertId')
        .sort({ timestamp: 1 })
        .lean()
    : [];
  return {
    accepted: inserted.length,
    duplicates,
    score,
    events: stored.map((e) => ({
      id: String(e._id),
      externalId: e.externalId ?? null,
      processing: e.processing?.status ?? 'pending',
      score: e.prediction?.score ?? null,
      isAnomaly: e.prediction?.isAnomaly ?? null,
      severity: e.prediction?.severity ?? null,
      alertId: e.alertId ? String(e.alertId) : null,
    })),
  };
}

export async function reprocessFailed(project: ProjectDoc, limit = 500) {
  // Pending events younger than two minutes may still be in flight in another request.
  const events = await ApiEventModel.find({
    projectId: project._id,
    $or: [
      { 'processing.status': 'failed' },
      { 'processing.status': 'pending', receivedAt: { $lt: new Date(Date.now() - 120_000) } },
    ],
  })
    .sort({ timestamp: 1 })
    .limit(limit);
  if (!events.length) return { attempted: 0, score: null };
  return { attempted: events.length, score: await scoreEvents(project, events) };
}
