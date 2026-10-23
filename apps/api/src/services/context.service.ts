import { Types } from 'mongoose';
import { ApiEventModel } from '../models/apiEvent.model.js';

/**
 * Windowed context for one event, computed with indexed aggregations. The definitions
 * mirror services/ml/pulse_ml/context.py and are pinned by a shared parity fixture.
 *
 * Requires MongoDB 7.0+ for the $median accumulator.
 */
export interface EventContext {
  clientRequests1m: number;
  clientRequests5m: number;
  clientErrors5m: number;
  clientAuthFailures5m: number;
  clientDistinctRoutes5m: number;
  routeLatencyBaselineMs: number | null;
  routeRequestBytesBaseline: number | null;
  routeResponseBytesBaseline: number | null;
}

interface ContextInput {
  projectId: Types.ObjectId;
  clientId: string;
  method: string;
  route: string;
  timestamp: Date;
}

const ONE_MINUTE = 60_000;
const FIVE_MINUTES = 300_000;
const BASELINE_WINDOW = 24 * 3_600_000;
const BASELINE_MAX_SAMPLES = 500;
const BASELINE_MIN_SAMPLES = 5;

export async function computeContext(e: ContextInput): Promise<EventContext> {
  const t = e.timestamp.getTime();
  const [clientAgg, routeAgg] = await Promise.all([
    ApiEventModel.aggregate<{
      requests5m: number;
      requests1m: number;
      errors: number;
      authFailures: number;
      endpoints: unknown[];
    }>([
      {
        $match: {
          projectId: e.projectId,
          clientId: e.clientId,
          timestamp: { $gte: new Date(t - FIVE_MINUTES), $lte: e.timestamp },
        },
      },
      {
        $group: {
          _id: null,
          requests5m: { $sum: 1 },
          requests1m: { $sum: { $cond: [{ $gte: ['$timestamp', new Date(t - ONE_MINUTE)] }, 1, 0] } },
          errors: { $sum: { $cond: [{ $gte: ['$statusCode', 400] }, 1, 0] } },
          authFailures: { $sum: { $cond: [{ $in: ['$statusCode', [401, 403]] }, 1, 0] } },
          endpoints: { $addToSet: { m: '$method', r: '$route' } },
        },
      },
    ]),
    ApiEventModel.aggregate<{ n: number; latency: number; requestBytes: number; responseBytes: number }>([
      {
        $match: {
          projectId: e.projectId,
          method: e.method,
          route: e.route,
          timestamp: { $gte: new Date(t - BASELINE_WINDOW), $lt: e.timestamp },
        },
      },
      { $sort: { timestamp: -1 } },
      { $limit: BASELINE_MAX_SAMPLES },
      {
        $group: {
          _id: null,
          n: { $sum: 1 },
          latency: { $median: { input: '$latencyMs', method: 'approximate' } },
          requestBytes: { $median: { input: '$requestBytes', method: 'approximate' } },
          responseBytes: { $median: { input: '$responseBytes', method: 'approximate' } },
        },
      },
    ]),
  ]);

  const c = clientAgg[0];
  const r = routeAgg[0];
  const hasBaseline = !!r && r.n >= BASELINE_MIN_SAMPLES;
  return {
    // The event itself is stored before its context is computed, so counts are >= 1.
    clientRequests1m: Math.max(1, c?.requests1m ?? 1),
    clientRequests5m: Math.max(1, c?.requests5m ?? 1),
    clientErrors5m: c?.errors ?? 0,
    clientAuthFailures5m: c?.authFailures ?? 0,
    clientDistinctRoutes5m: Math.max(1, c?.endpoints.length ?? 1),
    routeLatencyBaselineMs: hasBaseline ? r.latency : null,
    routeRequestBytesBaseline: hasBaseline ? r.requestBytes : null,
    routeResponseBytesBaseline: hasBaseline ? r.responseBytes : null,
  };
}
