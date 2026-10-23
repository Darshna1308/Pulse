import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { MlEvent } from '../src/services/ml.client.js';

/**
 * A stand-in for the Python ML service so API tests run without Python. It applies a
 * transparent rule (high per-client request rate) and returns responses in the real
 * schema. The real model is exercised by services/ml tests and scripts/e2e.mjs.
 */
export interface FakeMl {
  url: string;
  mode: 'ok' | 'down';
  requests: { path: string; token: string | undefined; body: unknown }[];
  close: () => Promise<void>;
}

function predict(e: MlEvent, index: number) {
  const c = e.context;
  const authRate = c.client_auth_failures_5m / c.client_requests_5m;
  const isAnomaly = c.client_requests_1m >= 50 || (e.status_code >= 500 && e.latency_ms > 5000);
  const score = Math.min(0.99, 0.45 + c.client_requests_1m / 200);
  return {
    index,
    anomaly_score: Number(score.toFixed(5)),
    is_anomaly: isAnomaly,
    detected_by: isAnomaly ? ['model'] : [],
    severity: isAnomaly ? (score > 0.9 ? 'critical' : score > 0.75 ? 'high' : 'medium') : null,
    percentile: isAnomaly ? 99.9 : 50,
    pattern: isAnomaly
      ? authRate > 0.5
        ? { code: 'auth_failures', title: 'Repeated authentication failures from one client' }
        : { code: 'rate_burst', title: 'Request rate far above baseline' }
      : { code: 'unusual_combination', title: 'Unusual combination of request attributes' },
    evidence: isAnomaly
      ? [
          {
            metric: 'client_requests_1m',
            label: 'Client request rate',
            unit: 'req/min',
            value: c.client_requests_1m,
            baseline_median: 3,
            baseline_p99: 20,
            ratio_to_median: c.client_requests_1m / 3,
            summary: `Client request rate of ${c.client_requests_1m} req/min`,
          },
        ]
      : [],
    attributions: isAnomaly ? [{ feature: 'log_client_requests_1m', label: 'Client request rate (1 min)', contribution: 0.12 }] : [],
  };
}

async function readBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const raw = Buffer.concat(chunks).toString();
  return raw ? JSON.parse(raw) : undefined;
}

export async function startFakeMl(): Promise<FakeMl> {
  const state: FakeMl = { url: '', mode: 'ok', requests: [], close: async () => undefined };
  const server: Server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    const body = await readBody(req);
    state.requests.push({ path: req.url ?? '', token: req.headers['x-internal-token'] as string | undefined, body });
    const send = (status: number, payload: unknown) => {
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(payload));
    };
    if (state.mode === 'down') return send(503, { detail: 'Model not loaded' });
    if (req.url === '/health') return send(200, { status: 'ok', model_loaded: true, model_version: 'fake-1' });
    if (req.url === '/model/info') return send(200, { version: 'fake-1', threshold: 0.6 });
    if (req.url === '/model/evaluation') return send(404, { detail: 'none' });
    if (req.url === '/predict') {
      const events = (body as { events: MlEvent[] }).events;
      return send(200, { model_version: 'fake-1', threshold: 0.6, policy: 'hybrid', predictions: events.map(predict) });
    }
    if (req.url === '/synthetic/events') {
      const now = Date.now();
      const events = Array.from({ length: 30 }, (_, i) => ({
        timestamp: new Date(now - (30 - i) * 60_000).toISOString(),
        client_id: `client_${i % 3}`,
        method: 'GET',
        route: '/v1/products',
        status_code: 200,
        latency_ms: 40,
        request_bytes: 0,
        response_bytes: 900,
        scenario: 'normal',
      }));
      return send(200, { seed: 1, events });
    }
    send(404, { detail: 'not found' });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  state.url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  state.close = () => new Promise((resolve) => server.close(() => resolve()));
  return state;
}
