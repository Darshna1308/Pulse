import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import { AlertModel } from '../src/models/alert.model.js';
import { bearer, createKey, createProject, event, registerUser, useTestApp, type TestUser } from './helpers.js';

const ctx = useTestApp();
let alice: TestUser;
let mallory: TestUser;
let projectId: string;
let keyId: string;
let aliceKey: string;
let eventId: string;
let alertId: string;

beforeAll(async () => {
  alice = await registerUser(ctx.app);
  mallory = await registerUser(ctx.app);
  projectId = (await createProject(ctx.app, alice, 'Alice prod')).id;
  const k = await createKey(ctx.app, alice, projectId);
  keyId = k.apiKey.id;
  aliceKey = k.key;
  // A burst from one client so the fake model raises an alert.
  const batch = Array.from({ length: 60 }, (_, i) => event({ clientId: 'burst', timestamp: new Date(Date.now() - i * 500).toISOString() }));
  const res = await request(ctx.app).post('/api/v1/ingest/events').set('X-Pulse-Key', aliceKey).send({ events: batch });
  eventId = res.body.data.events[0].id;
  alertId = String((await AlertModel.findOne({ projectId }))!._id);
});

describe('cross-user isolation', () => {
  const paths = () => [
    ['get', `/api/v1/projects/${projectId}`],
    ['patch', `/api/v1/projects/${projectId}`],
    ['delete', `/api/v1/projects/${projectId}`],
    ['get', `/api/v1/projects/${projectId}/keys`],
    ['post', `/api/v1/projects/${projectId}/keys`],
    ['delete', `/api/v1/projects/${projectId}/keys/${keyId}`],
    ['get', `/api/v1/projects/${projectId}/events`],
    ['get', `/api/v1/projects/${projectId}/events/${eventId}`],
    ['post', `/api/v1/projects/${projectId}/events/reprocess`],
    ['get', `/api/v1/projects/${projectId}/alerts`],
    ['get', `/api/v1/projects/${projectId}/alerts/${alertId}`],
    ['patch', `/api/v1/projects/${projectId}/alerts/${alertId}`],
    ['get', `/api/v1/projects/${projectId}/analytics/overview`],
  ] as const;

  it('answers 404 for every project-scoped route owned by someone else', async () => {
    for (const [method, path] of paths()) {
      const res = await request(ctx.app)[method](path).set(bearer(mallory)).send({ name: 'x', status: 'resolved', note: 'x' });
      expect(res.status, `${method.toUpperCase()} ${path}`).toBe(404);
    }
  });

  it('leaves the owner’s data untouched', async () => {
    const res = await request(ctx.app).get(`/api/v1/projects/${projectId}/alerts/${alertId}`).set(bearer(alice));
    expect(res.status).toBe(200);
    expect(res.body.data.alert.status).toBe('open');
    const keys = await request(ctx.app).get(`/api/v1/projects/${projectId}/keys`).set(bearer(alice));
    expect(keys.body.data[0].status).toBe('active');
  });

  it('does not list other users’ projects', async () => {
    const res = await request(ctx.app).get('/api/v1/projects').set(bearer(mallory));
    expect(res.body.data).toEqual([]);
  });

  it('cannot reach another project’s resources through its own project id', async () => {
    const own = await createProject(ctx.app, mallory, 'Mallory');
    expect((await request(ctx.app).get(`/api/v1/projects/${own.id}/alerts/${alertId}`).set(bearer(mallory))).status).toBe(404);
    expect((await request(ctx.app).get(`/api/v1/projects/${own.id}/events/${eventId}`).set(bearer(mallory))).status).toBe(404);
    expect((await request(ctx.app).delete(`/api/v1/projects/${own.id}/keys/${keyId}`).set(bearer(mallory))).status).toBe(404);
  });

  it('API keys write only to their own project', async () => {
    const own = await createProject(ctx.app, mallory, 'Mallory 2');
    const { key } = await createKey(ctx.app, mallory, own.id);
    await request(ctx.app).post('/api/v1/ingest/events').set('X-Pulse-Key', key).send(event({ clientId: 'mallory-client' }));
    const aliceEvents = await request(ctx.app).get(`/api/v1/projects/${projectId}/events`).query({ clientId: 'mallory-client' }).set(bearer(alice));
    expect(aliceEvents.body.meta.total).toBe(0);
    // Body fields cannot redirect an event into another project.
    const sneaky = await request(ctx.app).post('/api/v1/ingest/events').set('X-Pulse-Key', key).send({ ...event(), projectId });
    expect(sneaky.status).toBe(400);
  });

  it('treats malformed ids as not found', async () => {
    expect((await request(ctx.app).get('/api/v1/projects/not-an-id').set(bearer(alice))).status).toBe(404);
    expect((await request(ctx.app).get(`/api/v1/projects/${projectId}/alerts/123`).set(bearer(alice))).status).toBe(404);
  });

  it('requires authentication for project routes', async () => {
    expect((await request(ctx.app).get('/api/v1/projects')).status).toBe(401);
    expect((await request(ctx.app).get(`/api/v1/projects/${projectId}/events`)).status).toBe(401);
  });
});
