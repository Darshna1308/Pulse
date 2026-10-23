import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createKey, createProject, event, registerUser, useTestApp } from './helpers.js';

const ctx = useTestApp();

describe('rate limiting', () => {
  it('blocks repeated failed logins for the same account and IP', async () => {
    await registerUser(ctx.app, 'limited@example.com');
    const attempts = [];
    for (let i = 0; i < 11; i++) {
      attempts.push((await request(ctx.app).post('/api/v1/auth/login').send({ email: 'limited@example.com', password: 'wrong-password-1' })).status);
    }
    expect(attempts.slice(0, 10).every((s) => s === 401)).toBe(true);
    const last = await request(ctx.app).post('/api/v1/auth/login').send({ email: 'limited@example.com', password: 'wrong-password-1' });
    expect(last.status).toBe(429);
    expect(last.body.error.code).toBe('rate_limited');
    expect(last.headers['ratelimit']).toBeDefined();
  });

  it('limits ingestion per API key', async () => {
    const user = await registerUser(ctx.app);
    const project = await createProject(ctx.app, user);
    const { key } = await createKey(ctx.app, user, project.id);
    let limited = false;
    for (let i = 0; i < 125 && !limited; i++) {
      const res = await request(ctx.app).post('/api/v1/ingest/events').set('X-Pulse-Key', key).send(event({ clientId: `c${i}` }));
      limited = res.status === 429;
    }
    expect(limited).toBe(true);
  });
});
