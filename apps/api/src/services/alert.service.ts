import { Types } from 'mongoose';
import { badRequest, notFound } from '../lib/errors.js';
import { pageMeta } from '../lib/http.js';
import {
  ALERT_TRANSITIONS,
  AlertModel,
  MAX_ALERT_EVENT_REFS,
  publicAlert,
  type AlertDoc,
  type AlertStatus,
} from '../models/alert.model.js';
import { ApiEventModel, publicEvent, type ApiEventDoc } from '../models/apiEvent.model.js';
import type { ProjectDoc } from '../models/project.model.js';
import type { MlPrediction } from './ml.client.js';

/** Anomalies from the same client with the same pattern within this gap join one alert. */
export const ALERT_GROUPING_WINDOW_MS = 15 * 60_000;
const SEVERITY_RANK = { medium: 1, high: 2, critical: 3 } as const;
type Severity = keyof typeof SEVERITY_RANK;

export interface ScoredEvent {
  event: ApiEventDoc;
  prediction: MlPrediction;
  modelVersion: string;
  threshold: number;
}

/**
 * Create or extend alerts for anomalous events. Returns counts and assigns
 * event.alertId (persisted by the caller's bulk update).
 */
export async function recordAnomalies(project: ProjectDoc, scored: ScoredEvent[]) {
  const anomalies = scored
    .filter((s) => s.prediction.is_anomaly)
    .sort((a, b) => a.event.timestamp.getTime() - b.event.timestamp.getTime());
  const touched = new Map<string, AlertDoc>();
  let created = 0;

  for (const { event, prediction, modelVersion, threshold } of anomalies) {
    const patternCode = prediction.pattern?.code ?? 'unusual_combination';
    const title = prediction.pattern?.title ?? 'Unusual combination of request attributes';
    const severity = (prediction.severity ?? 'medium') as Severity;
    const key = `${event.clientId}|${patternCode}`;
    const ts = event.timestamp;

    let alert = touched.get(key);
    if (alert && ts.getTime() - alert.lastSeenAt.getTime() > ALERT_GROUPING_WINDOW_MS) alert = undefined;
    alert ??=
      (await AlertModel.findOne({
        projectId: project._id,
        clientId: event.clientId,
        patternCode,
        status: { $in: ['open', 'investigating'] },
        lastSeenAt: { $gte: new Date(ts.getTime() - ALERT_GROUPING_WINDOW_MS) },
      }).sort({ lastSeenAt: -1 })) ?? undefined;

    if (!alert) {
      alert = new AlertModel({
        projectId: project._id,
        severity,
        title,
        patternCode,
        clientId: event.clientId,
        method: event.method,
        route: event.route,
        score: prediction.anomaly_score,
        threshold,
        percentile: prediction.percentile,
        modelVersion,
        detectedBy: prediction.detected_by,
        evidence: prediction.evidence,
        attributions: prediction.attributions,
        eventIds: [event._id],
        eventCount: 1,
        firstSeenAt: ts,
        lastSeenAt: ts,
        simulated: project.isDemo,
        statusHistory: [{ from: null, to: 'open', note: 'Created by anomaly detection', at: new Date() }],
      });
      created += 1;
    } else {
      if (alert.eventIds.length < MAX_ALERT_EVENT_REFS) alert.eventIds.push(event._id);
      alert.eventCount += 1;
      if (ts > alert.lastSeenAt) alert.lastSeenAt = ts;
      if (ts < alert.firstSeenAt) alert.firstSeenAt = ts;
      if (SEVERITY_RANK[severity] > SEVERITY_RANK[alert.severity as Severity]) alert.severity = severity;
      alert.detectedBy = [...new Set([...alert.detectedBy, ...prediction.detected_by])];
      if (prediction.anomaly_score > alert.score) {
        // Keep the evidence of the most anomalous event in the group.
        Object.assign(alert, {
          score: prediction.anomaly_score,
          percentile: prediction.percentile,
          evidence: prediction.evidence,
          attributions: prediction.attributions,
          method: event.method,
          route: event.route,
          modelVersion,
          threshold,
        });
      }
    }
    touched.set(key, alert);
    event.alertId = alert._id;
  }

  await Promise.all([...touched.values()].map((a) => a.save()));
  return { created, updated: touched.size - created };
}

export async function listAlerts(
  project: ProjectDoc,
  q: { page: number; pageSize: number; status?: AlertStatus | 'active'; severity?: Severity },
) {
  const filter: Record<string, unknown> = { projectId: project._id };
  if (q.status === 'active') filter.status = { $in: ['open', 'investigating'] };
  else if (q.status) filter.status = q.status;
  if (q.severity) filter.severity = q.severity;
  const [items, total] = await Promise.all([
    AlertModel.find(filter)
      .select('-evidence -attributions -eventIds -statusHistory')
      .sort({ lastSeenAt: -1 })
      .skip((q.page - 1) * q.pageSize)
      .limit(q.pageSize),
    AlertModel.countDocuments(filter),
  ]);
  return {
    items: items.map((a) => {
      const { evidence: _e, attributions: _a, statusHistory: _s, ...rest } = publicAlert(a);
      return rest;
    }),
    meta: pageMeta(q.page, q.pageSize, total),
  };
}

export async function getAlert(project: ProjectDoc, alertId: string) {
  const alert = await AlertModel.findOne({ _id: alertId, projectId: project._id });
  if (!alert) throw notFound('Alert');
  const events = await ApiEventModel.find({ _id: { $in: alert.eventIds.slice(0, 50) }, projectId: project._id }).sort({
    timestamp: 1,
  });
  return { alert: publicAlert(alert), events: events.map(publicEvent) };
}

export async function updateAlertStatus(
  project: ProjectDoc,
  alertId: string,
  userId: string,
  input: { status: AlertStatus; note?: string },
) {
  const alert = await AlertModel.findOne({ _id: alertId, projectId: project._id });
  if (!alert) throw notFound('Alert');
  const from = alert.status as AlertStatus;
  if (from === input.status) throw badRequest(`Alert is already ${from}`);
  if (!ALERT_TRANSITIONS[from].includes(input.status)) {
    throw badRequest(`Cannot move an alert from ${from} to ${input.status}`);
  }
  if ((input.status === 'resolved' || input.status === 'dismissed') && !input.note?.trim()) {
    throw badRequest('A note is required when resolving or dismissing an alert');
  }
  alert.status = input.status;
  alert.statusHistory.push({ from, to: input.status, note: input.note?.trim(), changedBy: new Types.ObjectId(userId), at: new Date() });
  if (input.status === 'resolved' || input.status === 'dismissed') {
    alert.resolution = { note: input.note?.trim(), by: new Types.ObjectId(userId), at: new Date() };
  } else if (input.status === 'open') {
    alert.resolution = undefined;
  }
  await alert.save();
  return publicAlert(alert);
}
