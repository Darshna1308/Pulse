import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import { ApiKeyModel } from '../src/models/apiKey.model.js';
import { bearer, createProject, event, registerUser, useTestApp, type TestUser } from './helpers.js';

const ctx = useTestApp();
let user: TestUser;
let projectId: string;

beforeAll(async () => {
  user = await registerUser(ctx.app);
  projectId = (await createProject(ctx.app, user)).id;
});

describe('API keys', () => {
  it('shows the full key once and stores only an HMAC', async () => {
    const res = await request(ctx.app).post(`/api/v1/projects/${projectId}/keys`).set(bearer(user)).send({ name: 'Production' });
    expect(res.status).toBe(201);
    expect(res.headers['cache-control']).toBe('no-store');
    const { key, apiKey } = res.body.data;
    expect(key).toMatch(/^pulse_[a-f0-9]{12}_[A-Za-z0-9_-]{43}$/);
    expect(key.startsWith(apiKey.prefix)).toBe(true);

    const stored = await ApiKeyModel.findById(apiKey.id).select('+secretHash').lean();
    const secret = key.split('_').slice(2).join('_');
    expect(stored!.secretHash).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(stored)).not.toContain(secret);

    const list = await request(ctx.app).get(`/api/v1/projects/${projectId}/keys`).set(bearer(user));
    expect(JSON.stringify(list.body)).not.toContain(secret);
    expect(list.body.data[0]).not.toHaveProperty('secretHash');
    expect(list.body.data[0]).not.toHaveProperty('key');
  });

  it('authenticates ingestion and records last use', async () => {
    const created = await request(ctx.app).post(`/api/v1/projects/${projectId}/keys`).set(bearer(user)).send({ name: 'Ingest' });
    const { key, apiKey } = created.body.data;
    const res = await request(ctx.app).post('/api/v1/ingest/events').set('X-Pulse-Key', key).send(event());
    expect(res.status).toBe(201);
    expect((await ApiKeyModel.findById(apiKey.id).lean())!.lastUsedAt).toBeInstanceOf(Date);
  });

  it('rejects revoked, malformed, unknown and missing keys', async () => {
    const created = await request(ctx.app).post(`/api/v1/projects/${projectId}/keys`).set(bearer(user)).send({ name: 'Temp' });
    const { key, apiKey } = created.body.data;
    const revoke = await request(ctx.app).delete(`/api/v1/projects/${projectId}/keys/${apiKey.id}`).set(bearer(user));
    expect(revoke.body.data.status).toBe('revoked');

    const revoked = await request(ctx.app).post('/api/v1/ingest/events').set('X-Pulse-Key', key).send(event());
    expect(revoked.status).toBe(401);
    expect(revoked.body.error.code).toBe('api_key_revoked');

    const tampered = key.slice(0, -2) + (key.endsWith('AA') ? 'BB' : 'AA');
    expect((await request(ctx.app).post('/api/v1/ingest/events').set('X-Pulse-Key', tampered).send(event())).body.error.code).toBe('invalid_api_key');
    expect((await request(ctx.app).post('/api/v1/ingest/events').set('X-Pulse-Key', 'pulse_123').send(event())).status).toBe(401);
    expect((await request(ctx.app).post('/api/v1/ingest/events').send(event())).body.error.code).toBe('missing_api_key');
    // A user access token is not an ingestion credential.
    expect((await request(ctx.app).post('/api/v1/ingest/events').set(bearer(user)).send(event())).status).toBe(401);
  });

  it('validates key names', async () => {
    const res = await request(ctx.app).post(`/api/v1/projects/${projectId}/keys`).set(bearer(user)).send({ name: '' });
    expect(res.status).toBe(400);
  });
});
