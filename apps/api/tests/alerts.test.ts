import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import { bearer, createKey, createProject, event, registerUser, useTestApp, type TestUser } from './helpers.js';

const ctx = useTestApp();
let user: TestUser;
let projectId: string;
let alertId: string;
const base = () => `/api/v1/projects/${projectId}/alerts`;

beforeAll(async () => {
  user = await registerUser(ctx.app);
  projectId = (await createProject(ctx.app, user)).id;
  const { key } = await createKey(ctx.app, user, projectId);
  const now = Date.now();
  const burst = Array.from({ length: 70 }, (_, i) => event({ clientId: 'scraper', timestamp: new Date(now - 50_000 + i * 600).toISOString() }));
  await request(ctx.app).post('/api/v1/ingest/events').set('X-Pulse-Key', key).send({ events: burst });
  const list = await request(ctx.app).get(base()).set(bearer(user));
  alertId = list.body.data[0].id;
});

describe('alert investigation', () => {
  it('lists alerts with pagination metadata and filters', async () => {
    const res = await request(ctx.app).get(base()).query({ status: 'active' }).set(bearer(user));
    expect(res.status).toBe(200);
    expect(res.body.meta).toMatchObject({ page: 1, total: 1 });
    expect(res.body.data[0]).toMatchObject({ clientId: 'scraper', status: 'open', patternCode: 'rate_burst' });
    expect(res.body.data[0].evidence).toBeUndefined();
    const none = await request(ctx.app).get(base()).query({ status: 'resolved' }).set(bearer(user));
    expect(none.body.data).toHaveLength(0);
    expect((await request(ctx.app).get(base()).query({ status: 'bogus' }).set(bearer(user))).status).toBe(400);
  });

  it('returns evidence, model signal and related events', async () => {
    const res = await request(ctx.app).get(`${base()}/${alertId}`).set(bearer(user));
    expect(res.status).toBe(200);
    const { alert, events } = res.body.data;
    expect(alert.evidence.length).toBeGreaterThan(0);
    expect(alert.attributions.length).toBeGreaterThan(0);
    expect(alert.score).toBeGreaterThan(0);
    expect(alert.detectedBy).toContain('model');
    expect(events.length).toBe(Math.min(alert.eventCount, 50));
    expect(events.every((e: { clientId: string }) => e.clientId === 'scraper')).toBe(true);
    expect(alert.statusHistory[0]).toMatchObject({ to: 'open' });
  });

  it('moves through the lifecycle and persists history', async () => {
    const investigating = await request(ctx.app).patch(`${base()}/${alertId}`).set(bearer(user)).send({ status: 'investigating', note: 'Looking at client' });
    expect(investigating.status).toBe(200);
    expect(investigating.body.data.status).toBe('investigating');

    const noNote = await request(ctx.app).patch(`${base()}/${alertId}`).set(bearer(user)).send({ status: 'resolved' });
    expect(noNote.status).toBe(400);

    const resolved = await request(ctx.app).patch(`${base()}/${alertId}`).set(bearer(user)).send({ status: 'resolved', note: 'Rate limited the client' });
    expect(resolved.body.data).toMatchObject({ status: 'resolved', resolution: { note: 'Rate limited the client' } });

    const invalid = await request(ctx.app).patch(`${base()}/${alertId}`).set(bearer(user)).send({ status: 'investigating' });
    expect(invalid.status).toBe(400);
    expect(invalid.body.error.message).toMatch(/Cannot move an alert from resolved to investigating/);

    const reopened = await request(ctx.app).patch(`${base()}/${alertId}`).set(bearer(user)).send({ status: 'open', note: 'Seen again' });
    expect(reopened.body.data.resolution).toBeNull();

    const detail = await request(ctx.app).get(`${base()}/${alertId}`).set(bearer(user));
    expect(detail.body.data.alert.statusHistory.map((h: { to: string }) => h.to)).toEqual(['open', 'investigating', 'resolved', 'open']);
    expect(detail.body.data.alert.statusHistory[1].changedBy).toBe(user.id);
  });

  it('rejects unknown statuses and extra fields', async () => {
    expect((await request(ctx.app).patch(`${base()}/${alertId}`).set(bearer(user)).send({ status: 'deleted' })).status).toBe(400);
    expect((await request(ctx.app).patch(`${base()}/${alertId}`).set(bearer(user)).send({ status: 'dismissed', note: 'x', severity: 'low' })).status).toBe(400);
  });
});
