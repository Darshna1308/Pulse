import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import { ApiEventModel } from '../src/models/apiEvent.model.js';
import { ApiKeyModel } from '../src/models/apiKey.model.js';
import { bearer, createKey, createProject, event, registerUser, useTestApp, type TestUser } from './helpers.js';

const ctx = useTestApp();
let user: TestUser;

beforeAll(async () => {
  user = await registerUser(ctx.app);
});

describe('projects', () => {
  it('creates, lists with stats, updates and validates', async () => {
    const created = await request(ctx.app).post('/api/v1/projects').set(bearer(user)).send({ name: 'Orders API', environment: 'staging' });
    expect(created.status).toBe(201);
    expect(created.body.data).toMatchObject({ name: 'Orders API', environment: 'staging', isDemo: false });

    const list = await request(ctx.app).get('/api/v1/projects').set(bearer(user));
    expect(list.body.data[0].stats).toEqual({ events: 0, lastEventAt: null, unresolvedAlerts: 0 });

    const updated = await request(ctx.app).patch(`/api/v1/projects/${created.body.data.id}`).set(bearer(user)).send({ description: 'Public orders API' });
    expect(updated.body.data.description).toBe('Public orders API');

    expect((await request(ctx.app).post('/api/v1/projects').set(bearer(user)).send({ name: '' })).status).toBe(400);
    expect((await request(ctx.app).post('/api/v1/projects').set(bearer(user)).send({ name: 'x', environment: 'moon' })).status).toBe(400);
    expect((await request(ctx.app).patch(`/api/v1/projects/${created.body.data.id}`).set(bearer(user)).send({})).status).toBe(400);
  });

  it('deletes a project with its events and keys', async () => {
    const project = await createProject(ctx.app, user, 'Disposable');
    const { key } = await createKey(ctx.app, user, project.id);
    await request(ctx.app).post('/api/v1/ingest/events').set('X-Pulse-Key', key).send(event());
    expect(await ApiEventModel.countDocuments({ projectId: project.id })).toBe(1);

    expect((await request(ctx.app).delete(`/api/v1/projects/${project.id}`).set(bearer(user))).status).toBe(204);
    expect(await ApiEventModel.countDocuments({ projectId: project.id })).toBe(0);
    expect(await ApiKeyModel.countDocuments({ projectId: project.id })).toBe(0);
    expect((await request(ctx.app).post('/api/v1/ingest/events').set('X-Pulse-Key', key).send(event())).status).toBe(401);
  });

  it('creates a separate, labelled demo project through the real pipeline, once', async () => {
    const res = await request(ctx.app).post('/api/v1/projects/demo').set(bearer(user));
    expect(res.status).toBe(201);
    expect(res.body.data.project).toMatchObject({ isDemo: true });
    expect(res.body.data.events).toBe(30);
    const stored = await ApiEventModel.find({ projectId: res.body.data.project.id }).lean();
    expect(stored.every((e) => e.source === 'demo' && e.processing?.status === 'scored')).toBe(true);

    const again = await request(ctx.app).post('/api/v1/projects/demo').set(bearer(user));
    expect(again.status).toBe(409);
  });
});
