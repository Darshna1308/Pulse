/**
 * Minimal API client.
 *
 * - The access token lives only in memory (never localStorage).
 * - The refresh token is an HttpOnly cookie the browser sends to /api/v1/auth.
 * - On an expired access token the client refreshes once (deduplicated across
 *   concurrent calls and React StrictMode) and retries the request.
 */

export const API_BASE = '/api/v1';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  /** Field-level validation messages keyed by path, for forms. */
  fieldErrors(): Record<string, string> {
    if (this.code !== 'validation_error' || !Array.isArray(this.details)) return {};
    return Object.fromEntries((this.details as { path: string; message: string }[]).map((d) => [d.path, d.message]));
  }
}

export interface SessionPayload {
  user: { id: string; email: string; name: string; createdAt?: string };
  accessToken: string;
  accessTokenExpiresIn: number;
  csrfToken: string;
}

let accessToken: string | null = null;
let refreshInFlight: Promise<SessionPayload | null> | null = null;
const listeners = new Set<(session: SessionPayload | null) => void>();

export function setAccessToken(token: string | null) {
  accessToken = token;
}

/** Subscribe to session changes caused by refreshes or forced sign-outs. */
export function onSessionChange(fn: (session: SessionPayload | null) => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function readCookie(name: string): string | undefined {
  return document.cookie
    .split('; ')
    .find((c) => c.startsWith(`${name}=`))
    ?.slice(name.length + 1);
}

async function parse(res: Response) {
  if (res.status === 204) return null;
  const text = await res.text();
  const body = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const err = body?.error ?? {};
    throw new ApiError(res.status, err.code ?? 'http_error', err.message ?? `Request failed (${res.status})`, err.details);
  }
  return body;
}

/** Rotate the refresh cookie. Resolves to null when there is no valid session. */
export function refreshSession(): Promise<SessionPayload | null> {
  refreshInFlight ??= (async () => {
    try {
      const csrf = readCookie('pulse_csrf');
      if (!csrf) return null;
      const res = await fetch(`${API_BASE}/auth/refresh`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'X-CSRF-Token': decodeURIComponent(csrf) },
      });
      const body = await parse(res);
      const session = body.data as SessionPayload;
      accessToken = session.accessToken;
      listeners.forEach((l) => l(session));
      return session;
    } catch {
      accessToken = null;
      listeners.forEach((l) => l(null));
      return null;
    } finally {
      // Allow a later refresh once this one settles.
      setTimeout(() => (refreshInFlight = null), 0);
    }
  })();
  return refreshInFlight;
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined | null>;
  auth?: boolean;
  csrf?: boolean;
  signal?: AbortSignal;
}

export async function api<T>(path: string, opts: RequestOptions = {}): Promise<{ data: T; meta?: unknown }> {
  const url = new URL(`${API_BASE}${path}`, window.location.origin);
  Object.entries(opts.query ?? {}).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
  });

  const send = () => {
    const headers: Record<string, string> = {};
    if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
    if (opts.auth !== false && accessToken) headers.Authorization = `Bearer ${accessToken}`;
    if (opts.csrf) {
      const csrf = readCookie('pulse_csrf');
      if (csrf) headers['X-CSRF-Token'] = decodeURIComponent(csrf);
    }
    return fetch(url.pathname + url.search, {
      method: opts.method ?? 'GET',
      headers,
      credentials: 'same-origin',
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
      signal: opts.signal,
    });
  };

  let res = await send();
  if (res.status === 401 && opts.auth !== false) {
    const session = await refreshSession();
    if (session) res = await send();
  }
  return parse(res);
}
