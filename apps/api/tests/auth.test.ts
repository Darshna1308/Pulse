import jwt from 'jsonwebtoken';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { SessionModel } from '../src/models/session.model.js';
import { UserModel } from '../src/models/user.model.js';
import { ORIGIN, PASSWORD, bearer, parseSession, registerUser, useTestApp } from './helpers.js';

const ctx = useTestApp();

function refresh(cookie: string, csrf: string | undefined, origin = ORIGIN) {
  const req = request(ctx.app).post('/api/v1/auth/refresh').set('Origin', origin);
  const cookies = [cookie, ...(csrf ? [`pulse_csrf=${csrf}`] : [])];
  req.set('Cookie', cookies.join('; '));
  if (csrf) req.set('X-CSRF-Token', csrf);
  return req;
}

describe('registration', () => {
  it('creates an account, hashes the password with Argon2id and sets secure cookies', async () => {
    const res = await request(ctx.app)
      .post('/api/v1/auth/register')
      .set('Origin', ORIGIN)
      .send({ email: 'Alice@Example.com', password: PASSWORD, name: 'Alice' });
    expect(res.status).toBe(201);
    expect(res.body.data.user).toMatchObject({ email: 'alice@example.com', name: 'Alice' });
    expect(res.body.data.user.passwordHash).toBeUndefined();
    expect(res.body.data.accessToken).toEqual(expect.any(String));

    const cookies = ([] as string[]).concat(res.headers['set-cookie']);
    const rt = cookies.find((c) => c.startsWith('pulse_rt='))!;
    expect(rt).toMatch(/HttpOnly/);
    expect(rt).toMatch(/SameSite=Strict/);
    expect(rt).toMatch(/Path=\/api\/v1\/auth/);
    const csrf = cookies.find((c) => c.startsWith('pulse_csrf='))!;
    expect(csrf).not.toMatch(/HttpOnly/);

    const stored = await UserModel.findOne({ email: 'alice@example.com' }).select('+passwordHash').lean();
    expect(stored!.passwordHash).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
    expect(stored!.passwordHash).not.toContain(PASSWORD);

    const session = await SessionModel.findOne({ userId: stored!._id }).lean();
    const secret = rt.split(';')[0]!.split('=')[1]!.split('.')[1]!;
    expect(session!.refreshTokenHash).not.toContain(secret);
    expect(session!.refreshTokenHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('rejects duplicate emails, weak passwords and invalid emails', async () => {
    const dup = await request(ctx.app).post('/api/v1/auth/register').set('Origin', ORIGIN).send({ email: 'alice@example.com', password: PASSWORD, name: 'A' });
    expect(dup.status).toBe(409);
    expect(dup.body.error.code).toBe('email_taken');

    const weak = await request(ctx.app).post('/api/v1/auth/register').send({ email: 'b@example.com', password: 'short1', name: 'B' });
    expect(weak.status).toBe(400);
    expect(weak.body.error.code).toBe('validation_error');

    const letters = await request(ctx.app).post('/api/v1/auth/register').send({ email: 'b@example.com', password: 'onlyletters-here', name: 'B' });
    expect(letters.status).toBe(400);

    const bad = await request(ctx.app).post('/api/v1/auth/register').send({ email: 'not-an-email', password: PASSWORD, name: 'B' });
    expect(bad.status).toBe(400);
    expect(bad.body.error.details[0].path).toBe('email');
  });

  it('rejects requests from disallowed origins', async () => {
    const res = await request(ctx.app).post('/api/v1/auth/register').set('Origin', 'https://evil.example').send({ email: 'c@example.com', password: PASSWORD, name: 'C' });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('origin_not_allowed');
  });
});

describe('login', () => {
  it('returns the same error for unknown email and wrong password', async () => {
    await registerUser(ctx.app, 'login@example.com');
    const wrong = await request(ctx.app).post('/api/v1/auth/login').send({ email: 'login@example.com', password: 'wrong-password-1' });
    const unknown = await request(ctx.app).post('/api/v1/auth/login').send({ email: 'nobody@example.com', password: 'wrong-password-1' });
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrong.body.error).toMatchObject({ code: 'invalid_credentials', message: 'Invalid email or password' });
    expect(unknown.body.error.message).toBe(wrong.body.error.message);
  });

  it('signs in with valid credentials and grants access to protected routes', async () => {
    const res = await request(ctx.app).post('/api/v1/auth/login').set('Origin', ORIGIN).send({ email: 'LOGIN@example.com', password: PASSWORD });
    expect(res.status).toBe(200);
    const user = parseSession(res, 'login@example.com');
    const me = await request(ctx.app).get('/api/v1/auth/me').set(bearer(user));
    expect(me.status).toBe(200);
    expect(me.body.data.user.email).toBe('login@example.com');
  });

  it('never leaks stack traces in error responses', async () => {
    const res = await request(ctx.app).post('/api/v1/auth/login').set('Content-Type', 'application/json').send('{"email":');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('invalid_json');
    expect(JSON.stringify(res.body)).not.toMatch(/at .*\.(ts|js):\d+/);
  });
});

describe('access tokens', () => {
  it('rejects missing, malformed, tampered and expired tokens', async () => {
    const user = await registerUser(ctx.app);
    expect((await request(ctx.app).get('/api/v1/auth/me')).status).toBe(401);
    expect((await request(ctx.app).get('/api/v1/auth/me').set('Authorization', 'Bearer nope')).body.error.code).toBe('invalid_token');

    const [h, p] = user.accessToken.split('.');
    const forged = `${h}.${p}.${Buffer.from('forged-signature').toString('base64url')}`;
    expect((await request(ctx.app).get('/api/v1/auth/me').set('Authorization', `Bearer ${forged}`)).status).toBe(401);

    const claims = jwt.decode(user.accessToken) as { sid: string; sub: string };
    const expired = jwt.sign({ sid: claims.sid, typ: 'access' }, process.env.JWT_ACCESS_SECRET!, {
      subject: claims.sub,
      issuer: 'pulse-api',
      audience: 'pulse-web',
      expiresIn: -10,
    });
    const res = await request(ctx.app).get('/api/v1/auth/me').set('Authorization', `Bearer ${expired}`);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('token_expired');

    const noneAlg = jwt.sign({ sid: claims.sid, typ: 'access' }, '', { algorithm: 'none', subject: claims.sub });
    expect((await request(ctx.app).get('/api/v1/auth/me').set('Authorization', `Bearer ${noneAlg}`)).status).toBe(401);
  });

  it('issues tokens that expire after the configured TTL', async () => {
    const user = await registerUser(ctx.app);
    const { exp, iat } = jwt.decode(user.accessToken) as { exp: number; iat: number };
    expect(exp - iat).toBe(900);
  });
});

describe('refresh token rotation', () => {
  it('rotates the refresh token and issues a new access token', async () => {
    const user = await registerUser(ctx.app);
    const res = await refresh(user.refreshCookie, user.csrfToken);
    expect(res.status).toBe(200);
    const next = parseSession(res, user.email);
    expect(next.refreshCookie).not.toBe(user.refreshCookie);
    expect(next.accessToken).not.toBe(user.accessToken);
    expect((await request(ctx.app).get('/api/v1/auth/me').set(bearer(next))).status).toBe(200);
  });

  it('detects reuse of a rotated token and revokes the whole session', async () => {
    const user = await registerUser(ctx.app);
    const rotated = parseSession(await refresh(user.refreshCookie, user.csrfToken), user.email);

    const replay = await refresh(user.refreshCookie, user.csrfToken);
    expect(replay.status).toBe(401);
    expect(replay.body.error.code).toBe('refresh_token_reused');

    // The legitimate holder's newer token is now dead too, and so is its access token.
    expect((await refresh(rotated.refreshCookie, rotated.csrfToken)).status).toBe(401);
    expect((await request(ctx.app).get('/api/v1/auth/me').set(bearer(rotated))).status).toBe(401);
    const session = await SessionModel.findById((jwt.decode(user.accessToken) as { sid: string }).sid).lean();
    expect(session!.revokedReason).toBe('reuse_detected');
  });

  it('requires a matching CSRF token and an allowed origin', async () => {
    const user = await registerUser(ctx.app);
    const missing = await refresh(user.refreshCookie, undefined);
    expect(missing.status).toBe(403);
    expect(missing.body.error.code).toBe('csrf_failed');

    const mismatched = await request(ctx.app)
      .post('/api/v1/auth/refresh')
      .set('Cookie', `${user.refreshCookie}; pulse_csrf=${user.csrfToken}`)
      .set('X-CSRF-Token', 'something-else');
    expect(mismatched.status).toBe(403);

    expect((await refresh(user.refreshCookie, user.csrfToken, 'https://evil.example')).status).toBe(403);
  });

  it('rejects garbage refresh tokens', async () => {
    const res = await refresh('pulse_rt=not-a-token', 'abc');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('invalid_refresh_token');
  });

  it('rejects refresh after the idle timeout', async () => {
    const user = await registerUser(ctx.app);
    const sid = (jwt.decode(user.accessToken) as { sid: string }).sid;
    await SessionModel.updateOne({ _id: sid }, { $set: { idleExpiresAt: new Date(Date.now() - 1000) } });
    const res = await refresh(user.refreshCookie, user.csrfToken);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('session_expired');
  });
});

describe('logout and sessions', () => {
  it('logout revokes the session immediately', async () => {
    const user = await registerUser(ctx.app);
    const res = await request(ctx.app)
      .post('/api/v1/auth/logout')
      .set('Origin', ORIGIN)
      .set('Cookie', `${user.refreshCookie}; pulse_csrf=${user.csrfToken}`)
      .set('X-CSRF-Token', user.csrfToken);
    expect(res.status).toBe(204);
    expect(([] as string[]).concat(res.headers['set-cookie']).some((c) => c.startsWith('pulse_rt=;'))).toBe(true);
    expect((await request(ctx.app).get('/api/v1/auth/me').set(bearer(user))).body.error.code).toBe('session_revoked');
    expect((await refresh(user.refreshCookie, user.csrfToken)).status).toBe(401);
  });

  it('lists sessions and revokes the others', async () => {
    const first = await registerUser(ctx.app, 'multi@example.com');
    const second = parseSession(
      await request(ctx.app).post('/api/v1/auth/login').send({ email: 'multi@example.com', password: PASSWORD }),
      'multi@example.com',
    );
    const list = await request(ctx.app).get('/api/v1/auth/sessions').set(bearer(second));
    expect(list.body.data).toHaveLength(2);
    expect(list.body.data.filter((s: { current: boolean }) => s.current)).toHaveLength(1);

    const revoked = await request(ctx.app).post('/api/v1/auth/sessions/revoke-others').set(bearer(second));
    expect(revoked.body.data.revoked).toBe(1);
    expect((await request(ctx.app).get('/api/v1/auth/me').set(bearer(first))).status).toBe(401);
    expect((await request(ctx.app).get('/api/v1/auth/me').set(bearer(second))).status).toBe(200);
  });

  it('cannot revoke another user’s session', async () => {
    const a = await registerUser(ctx.app);
    const b = await registerUser(ctx.app);
    const sid = (jwt.decode(a.accessToken) as { sid: string }).sid;
    expect((await request(ctx.app).delete(`/api/v1/auth/sessions/${sid}`).set(bearer(b))).status).toBe(404);
    expect((await request(ctx.app).get('/api/v1/auth/me').set(bearer(a))).status).toBe(200);
  });

  it('changing the password requires the current one and signs out other sessions', async () => {
    const first = await registerUser(ctx.app, 'pw@example.com');
    const second = parseSession(
      await request(ctx.app).post('/api/v1/auth/login').send({ email: 'pw@example.com', password: PASSWORD }),
      'pw@example.com',
    );
    const bad = await request(ctx.app).post('/api/v1/auth/password').set(bearer(second)).send({ currentPassword: 'nope-nope-1', newPassword: 'brand-new-pass-7' });
    expect(bad.status).toBe(401);
    const ok = await request(ctx.app).post('/api/v1/auth/password').set(bearer(second)).send({ currentPassword: PASSWORD, newPassword: 'brand-new-pass-7' });
    expect(ok.status).toBe(200);
    expect((await request(ctx.app).get('/api/v1/auth/me').set(bearer(first))).status).toBe(401);
    expect((await request(ctx.app).post('/api/v1/auth/login').send({ email: 'pw@example.com', password: 'brand-new-pass-7' })).status).toBe(200);
  });
});
