import type { Express } from 'express';
import mongoose from 'mongoose';
import request from 'supertest';
import { afterAll, beforeAll } from 'vitest';
import { createApp } from '../src/app.js';
import { resetEnvCache } from '../src/config/env.js';
import { startFakeMl, type FakeMl } from './fakeMl.js';

export const ORIGIN = 'http://localhost:5173';
export const PASSWORD = 'correct-horse-42';

export interface TestContext {
  app: Express;
  ml: FakeMl;
}

/** Fresh app + database + fake ML service for one test file. */
export function useTestApp(): TestContext {
  const ctx = {} as TestContext;
  beforeAll(async () => {
    ctx.ml = await startFakeMl();
    process.env.ML_SERVICE_URL = ctx.ml.url;
    resetEnvCache();
    await mongoose.connect(process.env.MONGODB_URI!);
    await mongoose.connection.syncIndexes();
    ctx.app = createApp();
  });
  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
    await ctx.ml.close();
  });
  return ctx;
}

export interface TestUser {
  id: string;
  email: string;
  accessToken: string;
  refreshCookie: string;
  csrfToken: string;
  cookies: string[];
}

export function parseSession(res: request.Response, email: string): TestUser {
  const cookies = ([] as string[]).concat(res.headers['set-cookie'] ?? []);
  const refreshCookie = cookies.find((c) => c.startsWith('pulse_rt='))!.split(';')[0]!;
  return {
    id: res.body.data.user.id,
    email,
    accessToken: res.body.data.accessToken,
    csrfToken: res.body.data.csrfToken,
    refreshCookie,
    cookies,
  };
}

let counter = 0;
export async function registerUser(app: Express, email = `user${++counter}-${Date.now()}@example.com`): Promise<TestUser> {
  const res = await request(app)
    .post('/api/v1/auth/register')
    .set('Origin', ORIGIN)
    .send({ email, password: PASSWORD, name: 'Test User' });
  if (res.status !== 201) throw new Error(`register failed: ${res.status} ${JSON.stringify(res.body)}`);
  return parseSession(res, email);
}

export const bearer = (u: TestUser) => ({ Authorization: `Bearer ${u.accessToken}` });

export async function createProject(app: Express, user: TestUser, name = 'Test project') {
  const res = await request(app).post('/api/v1/projects').set(bearer(user)).send({ name });
  return res.body.data as { id: string; name: string };
}

export async function createKey(app: Express, user: TestUser, projectId: string, name = 'test key') {
  const res = await request(app).post(`/api/v1/projects/${projectId}/keys`).set(bearer(user)).send({ name });
  return res.body.data as { apiKey: { id: string; prefix: string }; key: string };
}

export function event(overrides: Record<string, unknown> = {}) {
  return {
    timestamp: new Date().toISOString(),
    method: 'GET',
    route: '/v1/orders/{id}',
    statusCode: 200,
    latencyMs: 40,
    requestBytes: 0,
    responseBytes: 1500,
    clientId: 'client_a',
    ...overrides,
  };
}
