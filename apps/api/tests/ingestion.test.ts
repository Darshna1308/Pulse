import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import { AlertModel } from '../src/models/alert.model.js';
import { ApiEventModel } from '../src/models/apiEvent.model.js';
import { bearer, createKey, createProject, event, registerUser, useTestApp, type TestUser } from './helpers.js';

const ctx = useTestApp();
let user: TestUser;
let projectId: string;
let key: string;

const ingest = (body: unknown) => request(ctx.app).post('/api/v1/ingest/events').set('X-Pulse-Key', key).send(body as object);

beforeAll(async () => {
  user = await registerUser(ctx.app);
  projectId = (await createProject(ctx.app, user)).id;
  key = (await createKey(ctx.app, user, projectId)).key;
});

describe('validation', () => {
  it.each([
    ['unknown fields such as headers', { ...event(), headers: { authorization: 'Bearer secret' } }],
    ['a route with a query string', event({ route: '/v1/orders?token=abc' })],
    ['a route without a leading slash', event({ route: 'v1/orders' })],
    ['an invalid status code', event({ statusCode: 999 })],
    ['negative latency', event({ latencyMs: -5 })],
    ['an unknown method', event({ method: 'BREW' })],
    ['a timestamp in the future', event({ timestamp: new Date(Date.now() + 3_600_000).toISOString() })],
    ['a timestamp older than 30 days', event({ timestamp: new Date(Date.now() - 31 * 86_400_000).toISOString() })],
    ['a client id with spaces', event({ clientId: 'has space' })],
    ['an empty batch', { events: [] }],
  ])('rejects %s', async (_label, body) => {
    const res = await ingest(body);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('validation_error');
  });

  it('rejects batches over 100 events', async () => {
    const res = await ingest({ events: Array.from({ length: 101 }, () => event()) });
    expect(res.status).toBe(400);
  });
});

describe('ingestion and scoring', () => {
  it('stores a single event with computed context and a model prediction', async () => {
    const res = await ingest(event({ clientId: 'single', method: 'post', route: '/v1/payments', statusCode: 201 }));
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ accepted: 1, duplicates: 0, score: { status: 'scored', scored: 1, modelVersion: 'fake-1' } });

    const stored = await ApiEventModel.findById(res.body.data.events[0].id).lean();
    expect(stored).toMatchObject({ method: 'POST', route: '/v1/payments', source: 'api_key', processing: { status: 'scored', attempts: 1 } });
    expect(stored!.context).toMatchObject({ clientRequests1m: 1, clientRequests5m: 1, clientDistinctRoutes5m: 1, routeLatencyBaselineMs: null });
    expect(stored!.prediction).toMatchObject({ isAnomaly: false, modelVersion: 'fake-1' });

    // The ML service received only metadata and the internal token.
    const call = ctx.ml.requests.filter((r) => r.path === '/predict').at(-1)!;
    expect(call.token).toBe('test-internal-token');
    expect(Object.keys((call.body as { events: object[] }).events[0]!).sort()).toEqual(
      ['client_id', 'context', 'latency_ms', 'method', 'request_bytes', 'response_bytes', 'route', 'status_code', 'timestamp'].sort(),
    );
  });

  it('computes windowed counts across earlier events from the same client', async () => {
    const t = Date.now() - 10_000;
    const batch = [
      event({ clientId: 'win', statusCode: 401, timestamp: new Date(t - 120_000).toISOString() }),
      event({ clientId: 'win', statusCode: 500, route: '/v1/b', timestamp: new Date(t - 30_000).toISOString() }),
      event({ clientId: 'win', statusCode: 200, route: '/v1/c', timestamp: new Date(t).toISOString() }),
    ];
    const res = await ingest({ events: batch });
    const last = await ApiEventModel.findById(res.body.data.events[2].id).lean();
    expect(last!.context).toMatchObject({
      clientRequests1m: 2,
      clientRequests5m: 3,
      clientErrors5m: 2,
      clientAuthFailures5m: 1,
      clientDistinctRoutes5m: 3,
    });
  });

  it('is idempotent on event ids, within and across requests', async () => {
    const first = await ingest({ events: [event({ id: 'evt-1' }), event({ id: 'evt-1' }), event({ id: 'evt-2' })] });
    expect(first.body.data).toMatchObject({ accepted: 2, duplicates: 1 });
    const again = await ingest({ events: [event({ id: 'evt-1' }), event({ id: 'evt-2' })] });
    expect(again.status).toBe(200);
    expect(again.body.data).toMatchObject({ accepted: 0, duplicates: 2 });
    expect(await ApiEventModel.countDocuments({ externalId: { $in: ['evt-1', 'evt-2'] } })).toBe(2);
  });

  it('creates one alert for a burst and groups follow-up anomalies into it', async () => {
    const now = Date.now();
    const burst = Array.from({ length: 60 }, (_, i) => event({ clientId: 'attacker', statusCode: 401, route: '/v1/login', method: 'POST', timestamp: new Date(now - 40_000 + i * 500).toISOString() }));
    const res = await ingest({ events: burst });
    expect(res.body.data.score.anomalies).toBeGreaterThan(0);
    expect(res.body.data.score.alertsCreated).toBe(1);

    const alerts = await AlertModel.find({ projectId, clientId: 'attacker' }).lean();
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({ status: 'open', patternCode: 'auth_failures', modelVersion: 'fake-1' });
    expect(alerts[0]!.eventCount).toBe(res.body.data.score.anomalies);
    expect(alerts[0]!.evidence[0]).toMatchObject({ metric: 'client_requests_1m' });

    const more = await ingest(event({ clientId: 'attacker', statusCode: 401, route: '/v1/login', method: 'POST' }));
    expect(more.body.data.score).toMatchObject({ alertsCreated: 0, alertsUpdated: 1 });
    const updated = await AlertModel.findById(alerts[0]!._id).lean();
    expect(updated!.eventCount).toBe(alerts[0]!.eventCount + 1);

    const anomalous = await ApiEventModel.findOne({ clientId: 'attacker', 'prediction.isAnomaly': true }).lean();
    expect(String(anomalous!.alertId)).toBe(String(alerts[0]!._id));
  });
});

describe('when the ML service is unavailable', () => {
  it('stores events as failed with a retryable status, never a fabricated score', async () => {
    ctx.ml.mode = 'down';
    const res = await ingest(event({ clientId: 'offline' }));
    expect(res.status).toBe(202);
    expect(res.body.data.score).toMatchObject({ status: 'ml_unavailable', retryable: true, failed: 1, reason: 'model_not_loaded' });
    const stored = await ApiEventModel.findById(res.body.data.events[0].id).lean();
    expect(stored!.processing).toMatchObject({ status: 'failed', error: 'model_not_loaded' });
    expect(stored!.prediction).toBeUndefined();

    ctx.ml.mode = 'ok';
    const retry = await request(ctx.app).post(`/api/v1/projects/${projectId}/events/reprocess`).set(bearer(user));
    expect(retry.status).toBe(200);
    expect(retry.body.data.score.status).toBe('scored');
    expect((await ApiEventModel.findById(stored!._id).lean())!.processing).toMatchObject({ status: 'scored', attempts: 2 });
  });

  it('reports unreachable services distinctly', async () => {
    const original = process.env.ML_SERVICE_URL;
    const { resetEnvCache } = await import('../src/config/env.js');
    process.env.ML_SERVICE_URL = 'http://127.0.0.1:9';
    resetEnvCache();
    try {
      const res = await ingest(event({ clientId: 'unreachable' }));
      expect(res.status).toBe(202);
      expect(res.body.data.score.reason).toBe('unreachable');
    } finally {
      process.env.ML_SERVICE_URL = original;
      resetEnvCache();
    }
  });
});
