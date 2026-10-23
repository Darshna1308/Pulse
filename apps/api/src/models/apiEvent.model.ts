import { Schema, model, Types, type InferSchemaType, type HydratedDocument } from 'mongoose';

export const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'] as const;
export const PROCESSING_STATUSES = ['pending', 'scored', 'failed'] as const;
export const SEVERITIES = ['medium', 'high', 'critical'] as const;

const contextSchema = new Schema(
  {
    clientRequests1m: Number,
    clientRequests5m: Number,
    clientErrors5m: Number,
    clientAuthFailures5m: Number,
    clientDistinctRoutes5m: Number,
    routeLatencyBaselineMs: { type: Number, default: null },
    routeRequestBytesBaseline: { type: Number, default: null },
    routeResponseBytesBaseline: { type: Number, default: null },
  },
  { _id: false },
);

const predictionSchema = new Schema(
  {
    score: Number,
    isAnomaly: Boolean,
    severity: { type: String, enum: [...SEVERITIES, null], default: null },
    percentile: Number,
    detectedBy: [String],
    modelVersion: String,
    threshold: Number,
    patternCode: String,
    patternTitle: String,
  },
  { _id: false },
);

/**
 * One API request's metadata. Pulse never stores headers, bodies, credentials or
 * query strings: only the route template, sizes, timing and a pseudonymous client id.
 */
const apiEventSchema = new Schema(
  {
    projectId: { type: Schema.Types.ObjectId, ref: 'Project', required: true },
    externalId: { type: String, maxlength: 128 },
    timestamp: { type: Date, required: true },
    method: { type: String, enum: HTTP_METHODS, required: true },
    route: { type: String, required: true, maxlength: 512 },
    statusCode: { type: Number, required: true, min: 100, max: 599 },
    latencyMs: { type: Number, required: true, min: 0 },
    requestBytes: { type: Number, default: 0, min: 0 },
    responseBytes: { type: Number, default: 0, min: 0 },
    clientId: { type: String, required: true, maxlength: 128 },
    source: { type: String, enum: ['api_key', 'demo'], required: true },
    apiKeyId: { type: Schema.Types.ObjectId, ref: 'ApiKey' },
    simulatedScenario: { type: String },
    context: { type: contextSchema },
    processing: {
      status: { type: String, enum: PROCESSING_STATUSES, default: 'pending' },
      error: { type: String },
      attempts: { type: Number, default: 0 },
      scoredAt: { type: Date },
    },
    prediction: { type: predictionSchema },
    alertId: { type: Schema.Types.ObjectId, ref: 'Alert' },
  },
  { timestamps: { createdAt: 'receivedAt', updatedAt: true } },
);

apiEventSchema.index({ projectId: 1, timestamp: -1 });
apiEventSchema.index({ projectId: 1, clientId: 1, timestamp: -1 });
apiEventSchema.index({ projectId: 1, method: 1, route: 1, timestamp: -1 });
apiEventSchema.index({ projectId: 1, 'prediction.isAnomaly': 1, timestamp: -1 });
apiEventSchema.index({ projectId: 1, 'processing.status': 1 });
apiEventSchema.index(
  { projectId: 1, externalId: 1 },
  { unique: true, partialFilterExpression: { externalId: { $type: 'string' } } },
);

export type ApiEvent = InferSchemaType<typeof apiEventSchema>;
export type ApiEventDoc = HydratedDocument<ApiEvent>;
export const ApiEventModel = model('ApiEvent', apiEventSchema);

export function publicEvent(e: ApiEventDoc | (ApiEvent & { _id: Types.ObjectId })) {
  return {
    id: String(e._id),
    externalId: e.externalId ?? null,
    timestamp: e.timestamp,
    method: e.method,
    route: e.route,
    statusCode: e.statusCode,
    latencyMs: e.latencyMs,
    requestBytes: e.requestBytes,
    responseBytes: e.responseBytes,
    clientId: e.clientId,
    source: e.source,
    simulatedScenario: e.simulatedScenario ?? null,
    context: e.context ?? null,
    processing: { status: e.processing?.status, error: e.processing?.error ?? null, attempts: e.processing?.attempts ?? 0 },
    prediction: e.prediction ?? null,
    alertId: e.alertId ? String(e.alertId) : null,
  };
}
