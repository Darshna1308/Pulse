import type { PipelineStage } from 'mongoose';
import { AlertModel } from '../models/alert.model.js';
import { ApiEventModel } from '../models/apiEvent.model.js';
import type { ProjectDoc } from '../models/project.model.js';

export const RANGES = {
  '1h': { ms: 3_600_000, unit: 'minute', binSize: 5 },
  '24h': { ms: 86_400_000, unit: 'minute', binSize: 30 },
  '7d': { ms: 7 * 86_400_000, unit: 'hour', binSize: 6 },
  '30d': { ms: 30 * 86_400_000, unit: 'day', binSize: 1 },
} as const;
export type RangeKey = keyof typeof RANGES;

const UNIT_MS = { minute: 60_000, hour: 3_600_000, day: 86_400_000 } as const;

interface Totals {
  requests: number;
  errors: number;
  serverErrors: number;
  anomalies: number;
  scored: number;
  failed: number;
  avgLatency: number | null;
  latencyPercentiles: number[] | null;
}

/** All dashboard metrics for one project and time range, computed with one aggregation. */
export async function overview(project: ProjectDoc, range: RangeKey, now = new Date()) {
  const cfg = RANGES[range];
  const binMs = UNIT_MS[cfg.unit] * cfg.binSize;
  const from = new Date(now.getTime() - cfg.ms);

  const [facet] = await ApiEventModel.aggregate<{
    totals: Totals[];
    series: { _id: Date; requests: number; errors: number; anomalies: number; avgLatency: number }[];
    statuses: { _id: number; count: number }[];
    endpoints: { _id: { method: string; route: string }; requests: number; errors: number; anomalies: number; avgLatency: number }[];
    clients: { _id: string; requests: number; errors: number; anomalies: number; maxScore: number | null }[];
  }>([
    { $match: { projectId: project._id, timestamp: { $gte: from, $lte: now } } },
    {
      $facet: {
        totals: [
          // $percentile (MongoDB 7.0+) is not yet in mongoose's type definitions.
          {
            $group: {
              _id: null,
              requests: { $sum: 1 },
              errors: { $sum: { $cond: [{ $gte: ['$statusCode', 400] }, 1, 0] } },
              serverErrors: { $sum: { $cond: [{ $gte: ['$statusCode', 500] }, 1, 0] } },
              anomalies: { $sum: { $cond: [{ $eq: ['$prediction.isAnomaly', true] }, 1, 0] } },
              scored: { $sum: { $cond: [{ $eq: ['$processing.status', 'scored'] }, 1, 0] } },
              failed: { $sum: { $cond: [{ $eq: ['$processing.status', 'failed'] }, 1, 0] } },
              avgLatency: { $avg: '$latencyMs' },
              latencyPercentiles: { $percentile: { input: '$latencyMs', p: [0.5, 0.95, 0.99], method: 'approximate' } },
            },
          } as unknown as PipelineStage.FacetPipelineStage,
        ],
        series: [
          {
            $group: {
              _id: { $dateTrunc: { date: '$timestamp', unit: cfg.unit, binSize: cfg.binSize } },
              requests: { $sum: 1 },
              errors: { $sum: { $cond: [{ $gte: ['$statusCode', 400] }, 1, 0] } },
              anomalies: { $sum: { $cond: [{ $eq: ['$prediction.isAnomaly', true] }, 1, 0] } },
              avgLatency: { $avg: '$latencyMs' },
            },
          },
        ],
        statuses: [{ $group: { _id: { $floor: { $divide: ['$statusCode', 100] } }, count: { $sum: 1 } } }],
        endpoints: [
          {
            $group: {
              _id: { method: '$method', route: '$route' },
              requests: { $sum: 1 },
              errors: { $sum: { $cond: [{ $gte: ['$statusCode', 400] }, 1, 0] } },
              anomalies: { $sum: { $cond: [{ $eq: ['$prediction.isAnomaly', true] }, 1, 0] } },
              avgLatency: { $avg: '$latencyMs' },
            },
          },
          { $sort: { requests: -1 } },
          { $limit: 8 },
        ],
        clients: [
          {
            $group: {
              _id: '$clientId',
              requests: { $sum: 1 },
              errors: { $sum: { $cond: [{ $gte: ['$statusCode', 400] }, 1, 0] } },
              anomalies: { $sum: { $cond: [{ $eq: ['$prediction.isAnomaly', true] }, 1, 0] } },
              maxScore: { $max: '$prediction.score' },
            },
          },
          { $sort: { anomalies: -1, requests: -1 } },
          { $limit: 8 },
        ],
      },
    },
  ]);

  const [alertCounts, openBySeverity] = await Promise.all([
    AlertModel.aggregate<{ _id: string; count: number }>([
      { $match: { projectId: project._id } },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]),
    AlertModel.aggregate<{ _id: string; count: number }>([
      { $match: { projectId: project._id, status: { $in: ['open', 'investigating'] } } },
      { $group: { _id: '$severity', count: { $sum: 1 } } },
    ]),
  ]);

  const t = facet?.totals[0];
  const requests = t?.requests ?? 0;

  // Zero-fill the series so charts show real gaps instead of interpolating across them.
  const byBucket = new Map((facet?.series ?? []).map((s) => [new Date(s._id).getTime(), s]));
  const series = [];
  for (let b = Math.floor(from.getTime() / binMs) * binMs; b <= now.getTime(); b += binMs) {
    const s = byBucket.get(b);
    series.push({
      bucket: new Date(b).toISOString(),
      requests: s?.requests ?? 0,
      errors: s?.errors ?? 0,
      anomalies: s?.anomalies ?? 0,
      avgLatencyMs: s ? Math.round(s.avgLatency * 10) / 10 : null,
    });
  }

  const statusTotals = new Map((facet?.statuses ?? []).map((s) => [s._id, s.count]));
  const counts = Object.fromEntries(alertCounts.map((a) => [a._id, a.count]));

  return {
    range,
    from: from.toISOString(),
    to: now.toISOString(),
    bucketMs: binMs,
    totals: {
      requests,
      errors: t?.errors ?? 0,
      errorRate: requests ? (t!.errors / requests) : null,
      serverErrorRate: requests ? (t!.serverErrors / requests) : null,
      avgLatencyMs: t?.avgLatency != null ? Math.round(t.avgLatency * 10) / 10 : null,
      p50LatencyMs: t?.latencyPercentiles?.[0] ?? null,
      p95LatencyMs: t?.latencyPercentiles?.[1] ?? null,
      p99LatencyMs: t?.latencyPercentiles?.[2] ?? null,
      anomalies: t?.anomalies ?? 0,
      scored: t?.scored ?? 0,
      failedScoring: t?.failed ?? 0,
    },
    alerts: {
      open: counts.open ?? 0,
      investigating: counts.investigating ?? 0,
      resolved: counts.resolved ?? 0,
      dismissed: counts.dismissed ?? 0,
      unresolved: (counts.open ?? 0) + (counts.investigating ?? 0),
      unresolvedBySeverity: Object.fromEntries(openBySeverity.map((a) => [a._id, a.count])),
    },
    series,
    statusDistribution: [2, 3, 4, 5].map((c) => ({ statusClass: `${c}xx`, count: statusTotals.get(c) ?? 0 })),
    topEndpoints: (facet?.endpoints ?? []).map((e) => ({
      method: e._id.method,
      route: e._id.route,
      requests: e.requests,
      errorRate: e.requests ? e.errors / e.requests : 0,
      anomalies: e.anomalies,
      avgLatencyMs: Math.round(e.avgLatency * 10) / 10,
    })),
    topClients: (facet?.clients ?? []).map((c) => ({
      clientId: c._id,
      requests: c.requests,
      errorRate: c.requests ? c.errors / c.requests : 0,
      anomalies: c.anomalies,
      maxScore: c.maxScore,
    })),
  };
}

/** Distribution of stored anomaly scores, for the analytics page histogram. */
export async function scoreDistribution(project: ProjectDoc, range: RangeKey, now = new Date()) {
  const from = new Date(now.getTime() - RANGES[range].ms);
  const buckets = await ApiEventModel.aggregate<{ _id: number | string; count: number; anomalies: number }>([
    { $match: { projectId: project._id, timestamp: { $gte: from, $lte: now }, 'processing.status': 'scored' } },
    {
      $bucket: {
        groupBy: '$prediction.score',
        boundaries: [0, 0.35, 0.4, 0.45, 0.5, 0.55, 0.6, 0.65, 0.7, 0.75, 0.8, 1.01],
        default: 'other',
        output: { count: { $sum: 1 }, anomalies: { $sum: { $cond: ['$prediction.isAnomaly', 1, 0] } } },
      },
    },
  ]);
  const bounds = [0, 0.35, 0.4, 0.45, 0.5, 0.55, 0.6, 0.65, 0.7, 0.75, 0.8, 1.0];
  const map = new Map(buckets.map((b) => [b._id, b]));
  return bounds.slice(0, -1).map((lo, i) => ({
    from: lo,
    to: bounds[i + 1]!,
    count: map.get(lo)?.count ?? 0,
    anomalies: map.get(lo)?.anomalies ?? 0,
  }));
}
