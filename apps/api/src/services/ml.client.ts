import { env } from '../config/env.js';
import { logger } from '../lib/logger.js';

/** Raised when the ML service cannot produce a result. Callers persist a retryable state. */
export class MlUnavailableError extends Error {
  constructor(
    message: string,
    public readonly reason: 'timeout' | 'unreachable' | 'model_not_loaded' | 'bad_response' | 'rejected',
  ) {
    super(message);
    this.name = 'MlUnavailableError';
  }
}

export interface MlContext {
  client_requests_1m: number;
  client_requests_5m: number;
  client_errors_5m: number;
  client_auth_failures_5m: number;
  client_distinct_routes_5m: number;
  route_latency_baseline_ms: number | null;
  route_request_bytes_baseline: number | null;
  route_response_bytes_baseline: number | null;
}

export interface MlEvent {
  method: string;
  route: string;
  status_code: number;
  latency_ms: number;
  request_bytes: number;
  response_bytes: number;
  timestamp: string;
  client_id: string;
  context: MlContext;
}

export interface MlEvidence {
  metric: string;
  label: string;
  unit: string;
  value: number | null;
  baseline_median: number | null;
  baseline_p99: number | null;
  ratio_to_median: number | null;
  summary: string;
}

export interface MlPrediction {
  index: number;
  anomaly_score: number;
  is_anomaly: boolean;
  detected_by: Array<'model' | 'guardrail'>;
  severity: 'medium' | 'high' | 'critical' | null;
  percentile: number;
  pattern: { code: string; title: string } | null;
  evidence: MlEvidence[];
  attributions: Array<{ feature: string; label: string; contribution: number }>;
}

export interface MlPredictResponse {
  model_version: string;
  threshold: number;
  policy: string;
  predictions: MlPrediction[];
}

export interface SyntheticEvent {
  timestamp: string;
  client_id: string;
  method: string;
  route: string;
  status_code: number;
  latency_ms: number;
  request_bytes: number;
  response_bytes: number;
  scenario: string;
}

async function call<T>(path: string, init: { method?: string; body?: unknown; timeoutMs?: number } = {}): Promise<T> {
  const { ML_SERVICE_URL, ML_SERVICE_TOKEN, ML_TIMEOUT_MS } = env();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), init.timeoutMs ?? ML_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(new URL(path, ML_SERVICE_URL), {
      method: init.method ?? 'GET',
      headers: {
        'content-type': 'application/json',
        ...(ML_SERVICE_TOKEN ? { 'x-internal-token': ML_SERVICE_TOKEN } : {}),
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      signal: controller.signal,
    });
  } catch (err) {
    const timedOut = (err as Error).name === 'AbortError';
    logger.warn({ path, err: (err as Error).message }, 'ML service request failed');
    throw new MlUnavailableError(timedOut ? 'ML service timed out' : 'ML service unreachable', timedOut ? 'timeout' : 'unreachable');
  } finally {
    clearTimeout(timer);
  }

  if (res.status === 404) return null as T;
  if (res.status === 503) throw new MlUnavailableError('ML model is not loaded', 'model_not_loaded');
  if (!res.ok) {
    logger.warn({ path, status: res.status }, 'ML service returned an error');
    throw new MlUnavailableError(`ML service responded with ${res.status}`, res.status === 422 ? 'rejected' : 'bad_response');
  }
  return (await res.json()) as T;
}

export const mlClient = {
  async predict(events: MlEvent[], policy = env().ML_DETECTION_POLICY): Promise<MlPredictResponse> {
    const body = await call<MlPredictResponse | null>('/predict', { method: 'POST', body: { events, explain: true, policy } });
    if (!body || !Array.isArray(body.predictions) || body.predictions.length !== events.length) {
      throw new MlUnavailableError('ML service returned an unexpected response', 'bad_response');
    }
    return body;
  },
  health: () => call<{ status: string; model_loaded: boolean; model_version: string | null }>('/health', { timeoutMs: 2000 }),
  modelInfo: () => call<Record<string, unknown>>('/model/info'),
  evaluation: () => call<Record<string, unknown> | null>('/model/evaluation'),
  runEvaluation: () => call<Record<string, unknown>>('/model/evaluate', { method: 'POST', timeoutMs: 120_000 }),
  synthetic: (body: { seed: number; minutes: number; clients: number; incidents: number; end_time?: string }) =>
    call<{ seed: number; events: SyntheticEvent[] }>('/synthetic/events', { method: 'POST', body, timeoutMs: 60_000 }),
};
