import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const session = { user: { id: 'u1', email: 'a@b.co', name: 'A' }, accessToken: 'tok-2', accessTokenExpiresIn: 900, csrfToken: 'c' };

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

describe('api client', () => {
  beforeEach(() => {
    vi.resetModules();
    document.cookie = 'pulse_csrf=csrf-value';
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    document.cookie = 'pulse_csrf=; expires=Thu, 01 Jan 1970 00:00:00 GMT';
  });

  it('refreshes once for concurrent 401s and retries with the new token', async () => {
    const calls: { url: string; auth?: string; csrf?: string }[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init: RequestInit) => {
        const h = (init.headers ?? {}) as Record<string, string>;
        calls.push({ url, auth: h.Authorization, csrf: h['X-CSRF-Token'] });
        if (url.endsWith('/auth/refresh')) return json(200, { data: session });
        return h.Authorization === 'Bearer tok-2' ? json(200, { data: { ok: true } }) : json(401, { error: { code: 'unauthorized', message: 'no' } });
      }),
    );
    const { api, setAccessToken } = await import('@/api/client');
    setAccessToken('tok-1');
    const results = await Promise.all([api('/projects'), api('/alerts'), api('/events')]);
    expect(results.every((r) => (r.data as { ok: boolean }).ok)).toBe(true);
    const refreshes = calls.filter((c) => c.url.endsWith('/auth/refresh'));
    expect(refreshes).toHaveLength(1);
    expect(refreshes[0]?.csrf).toBe('csrf-value');
  });

  it('signs out listeners when refresh fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => json(401, { error: { code: 'unauthorized', message: 'expired' } })),
    );
    const { api, onSessionChange } = await import('@/api/client');
    const seen: unknown[] = [];
    onSessionChange((s) => seen.push(s));
    await expect(api('/projects')).rejects.toMatchObject({ status: 401, code: 'unauthorized' });
    expect(seen).toEqual([null]);
  });

  it('exposes field errors from validation responses', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        json(400, { error: { code: 'validation_error', message: 'Invalid', details: [{ path: 'email', message: 'Enter a valid email address' }] } }),
      ),
    );
    const { api, ApiError } = await import('@/api/client');
    const err = await api('/auth/register', { method: 'POST', body: {}, auth: false }).catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.fieldErrors()).toEqual({ email: 'Enter a valid email address' });
  });
});
