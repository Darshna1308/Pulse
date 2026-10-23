import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import { bearer, createKey, createProject, event, registerUser, useTestApp, type TestUser } from './helpers.js';

const ctx = useTestApp();
let user: TestUser;
let projectId: string;

beforeAll(async () => {
  user = await registerUser(ctx.app);
  projectId = (await createProject(ctx.app, user)).id;
  const { key } = await createKey(ctx.app, user, projectId);
  const now = Date.now();
  const events = [
    ...Array.from({ length: 8 }, (_, i) => event({ clientId: `c${i % 2}`, latencyMs: 10 * (i + 1), timestamp: new Date(now - 20 * 60_000 - i * 1000).toISOString() })),
    event({ clientId: 'c0', statusCode: 404, timestamp: new Date(now - 10 * 60_000).toISOString() }),
    event({ clientId: 'c1', statusCode: 503, method: 'POST', route: '/v1/pay', timestamp: new Date(now - 5 * 60_000).toISOString() }),
    event({ clientId: 'old', timestamp: new Date(now - 3 * 86_400_000).toISOString() }),
  ];
  await request(ctx.app).post('/api/v1/ingest/events').set('X-Pulse-Key', key).send({ events });
});

describe('analytics overview', () => {
  it('computes totals, rates and latency for the selected range only', async () => {
    const res = await request(ctx.app).get(`/api/v1/projects/${projectId}/analytics/overview`).query({ range: '24h' }).set(bearer(user));
    expect(res.status).toBe(200);
    const { totals, statusDistribution, series, topEndpoints } = res.body.data;
    expect(totals.requests).toBe(10);
    expect(totals.errors).toBe(2);
    expect(totals.errorRate).toBeCloseTo(0.2);
    expect(totals.serverErrorRate).toBeCloseTo(0.1);
    expect(totals.avgLatencyMs).toBeCloseTo((360 + 40 + 40) / 10, 1);
    expect(totals.p95LatencyMs).toBeGreaterThan(totals.p50LatencyMs);
    expect(totals.scored).toBe(10);
    expect(statusDistribution).toEqual([
      { statusClass: '2xx', count: 8 },
      { statusClass: '3xx', count: 0 },
      { statusClass: '4xx', count: 1 },
      { statusClass: '5xx', count: 1 },
    ]);
    expect(series.length).toBeGreaterThanOrEqual(48);
    expect(series.reduce((s: number, b: { requests: number }) => s + b.requests, 0)).toBe(10);
    expect(topEndpoints[0]).toMatchObject({ method: 'GET', route: '/v1/orders/{id}', requests: 9 });
  });

  it('widens with the range and validates it', async () => {
    const week = await request(ctx.app).get(`/api/v1/projects/${projectId}/analytics/overview`).query({ range: '7d' }).set(bearer(user));
    expect(week.body.data.totals.requests).toBe(11);
    const hour = await request(ctx.app).get(`/api/v1/projects/${projectId}/analytics/overview`).query({ range: '1h' }).set(bearer(user));
    expect(hour.body.data.totals.requests).toBe(10);
    expect((await request(ctx.app).get(`/api/v1/projects/${projectId}/analytics/overview`).query({ range: '2y' }).set(bearer(user))).status).toBe(400);
  });

  it('returns an empty but well-formed overview for a new project', async () => {
    const empty = await createProject(ctx.app, user, 'Empty');
    const res = await request(ctx.app).get(`/api/v1/projects/${empty.id}/analytics/overview`).set(bearer(user));
    expect(res.body.data.totals).toMatchObject({ requests: 0, errorRate: null, avgLatencyMs: null });
    expect(res.body.data.alerts.unresolved).toBe(0);
  });

  it('returns a score histogram', async () => {
    const res = await request(ctx.app).get(`/api/v1/projects/${projectId}/analytics/scores`).set(bearer(user));
    expect(res.body.data.reduce((s: number, b: { count: number }) => s + b.count, 0)).toBe(10);
  });
});

describe('event listing', () => {
  const list = (query: Record<string, string | number>) =>
    request(ctx.app).get(`/api/v1/projects/${projectId}/events`).query(query).set(bearer(user));

  it('paginates newest first', async () => {
    const page1 = await list({ pageSize: 4 });
    expect(page1.body.meta).toMatchObject({ page: 1, pageSize: 4, total: 11, totalPages: 3 });
    const page3 = await list({ pageSize: 4, page: 3 });
    expect(page3.body.data).toHaveLength(3);
    const times = page1.body.data.map((e: { timestamp: string }) => Date.parse(e.timestamp));
    expect([...times].sort((a, b) => b - a)).toEqual(times);
  });

  it('filters by status class, method, route, client and anomaly flag', async () => {
    expect((await list({ statusClass: '5xx' })).body.meta.total).toBe(1);
    expect((await list({ statusClass: '4xx' })).body.data[0].statusCode).toBe(404);
    expect((await list({ method: 'POST' })).body.meta.total).toBe(1);
    expect((await list({ route: 'pay' })).body.meta.total).toBe(1);
    expect((await list({ route: '.*' })).body.meta.total).toBe(0); // regex characters are escaped
    expect((await list({ clientId: 'old' })).body.meta.total).toBe(1);
    expect((await list({ anomaly: 'true' })).body.meta.total).toBe(0);
    expect((await list({ pageSize: 500 })).status).toBe(400);
  });
});
