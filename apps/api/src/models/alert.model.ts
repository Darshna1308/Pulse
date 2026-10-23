import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose';
import { SEVERITIES } from './apiEvent.model.js';

export const ALERT_STATUSES = ['open', 'investigating', 'resolved', 'dismissed'] as const;
export type AlertStatus = (typeof ALERT_STATUSES)[number];

/** Allowed lifecycle transitions. Resolved and dismissed alerts can be reopened. */
export const ALERT_TRANSITIONS: Record<AlertStatus, AlertStatus[]> = {
  open: ['investigating', 'resolved', 'dismissed'],
  investigating: ['open', 'resolved', 'dismissed'],
  resolved: ['open'],
  dismissed: ['open'],
};

export const MAX_ALERT_EVENT_REFS = 200;

const alertSchema = new Schema(
  {
    projectId: { type: Schema.Types.ObjectId, ref: 'Project', required: true },
    status: { type: String, enum: ALERT_STATUSES, default: 'open' },
    severity: { type: String, enum: SEVERITIES, required: true },
    title: { type: String, required: true },
    patternCode: { type: String, required: true },
    clientId: { type: String, required: true },
    method: String,
    route: String,
    /** Highest model anomaly score among grouped events (a ranking signal, not a probability). */
    score: { type: Number, required: true },
    threshold: Number,
    percentile: Number,
    modelVersion: String,
    detectedBy: [String],
    /** Observed facts from the highest-scoring event, compared with the training baseline. */
    evidence: { type: [Schema.Types.Mixed], default: [] },
    /** Model sensitivity per feature for the highest-scoring event. */
    attributions: { type: [Schema.Types.Mixed], default: [] },
    eventIds: { type: [Schema.Types.ObjectId], ref: 'ApiEvent', default: [] },
    eventCount: { type: Number, default: 0 },
    firstSeenAt: { type: Date, required: true },
    lastSeenAt: { type: Date, required: true },
    simulated: { type: Boolean, default: false },
    statusHistory: {
      type: [
        new Schema(
          {
            from: String,
            to: String,
            note: String,
            changedBy: { type: Schema.Types.ObjectId, ref: 'User' },
            at: { type: Date, default: () => new Date() },
          },
          { _id: false },
        ),
      ],
      default: [],
    },
    resolution: {
      note: String,
      by: { type: Schema.Types.ObjectId, ref: 'User' },
      at: Date,
    },
  },
  { timestamps: true },
);

alertSchema.index({ projectId: 1, status: 1, lastSeenAt: -1 });
alertSchema.index({ projectId: 1, lastSeenAt: -1 });
alertSchema.index({ projectId: 1, clientId: 1, patternCode: 1, status: 1, lastSeenAt: -1 });

export type Alert = InferSchemaType<typeof alertSchema>;
export type AlertDoc = HydratedDocument<Alert>;
export const AlertModel = model('Alert', alertSchema);

export function publicAlert(a: AlertDoc) {
  return {
    id: String(a._id),
    status: a.status,
    severity: a.severity,
    title: a.title,
    patternCode: a.patternCode,
    clientId: a.clientId,
    method: a.method ?? null,
    route: a.route ?? null,
    score: a.score,
    threshold: a.threshold ?? null,
    percentile: a.percentile ?? null,
    modelVersion: a.modelVersion ?? null,
    detectedBy: a.detectedBy,
    evidence: a.evidence,
    attributions: a.attributions,
    eventCount: a.eventCount,
    firstSeenAt: a.firstSeenAt,
    lastSeenAt: a.lastSeenAt,
    simulated: a.simulated,
    statusHistory: (a.statusHistory ?? []).map((h) => ({
      from: h.from,
      to: h.to,
      note: h.note ?? null,
      changedBy: h.changedBy ? String(h.changedBy) : null,
      at: h.at,
    })),
    resolution: a.resolution?.at ? { note: a.resolution.note ?? null, at: a.resolution.at } : null,
    createdAt: a.createdAt,
    updatedAt: a.updatedAt,
  };
}
