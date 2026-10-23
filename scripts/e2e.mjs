#!/usr/bin/env node
/**
 * End-to-end check against a running stack (MongoDB + API + ML service).
 *
 *   npm run e2e                       # API at http://localhost:4000
 *   PULSE_API=http://host:4000 npm run e2e
 *
 * It creates two throwaway users and exercises the real flow: register, project,
 * API key, ingestion, ML scoring, alert grouping, alert lifecycle, refresh-token
 * rotation and reuse detection, key revocation and cross-user isolation.
 * Nothing is mocked; the script fails loudly on the first broken expectation.
 */

const API = (process.env.PULSE_API ?? 'http://localhost:4000').replace(/\/$/, '') + '/api/v1';
const ORIGIN = process.env.PULSE_ORIGIN ?? 'http://localhost:5173';
const run = Date.now().toString(36);
let passed = 0;

function check(cond, label, detail) {
  if (!cond) {
    console.error(`  ✗ ${label}`);
    if (detail !== undefined) console.error('   ', typeof detail === 'string' ? detail : JSON.stringify(detail, null, 2).slice(0, 2000));
    process.exit(1);
  }
  passed++;
  console.log(`  ✓ ${label}`);
}

async function call(method, path, { body, token, key, cookie, csrf } = {}) {
  const headers = { Origin: ORIGIN };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;
  if (key) headers['X-Pulse-Key'] = key;
  if (cookie) headers.Cookie = cookie;
  if (csrf) headers['X-CSRF-Token'] = csrf;
  const res = await fetch(API + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null, cookies: res.headers.getSetCookie() };
}

function session(res) {
  const pick = (name) => res.cookies.find((c) => c.startsWith(`${name}=`))?.split(';')[0];
  const rt = pick('pulse_rt');
  const csrf = pick('pulse_csrf');
  return { token: res.body.data.accessToken, cookie: [rt, csrf].join('; '), csrf: csrf?.split('=')[1] };
}

async function register(label) {
  const res = await call('POST', '/auth/register', {
    body: { name: `E2E ${label}`, email: `e2e-${label}-${run}@example.com`, password: `E2e-${run}-pass-9` },
  });
  check(res.status === 201, `register ${label}`, res.body);
  return session(res);
}

const ROUTES = [
  ['GET', '/v1/products', 200, 45, 0, 4800],
  ['GET', '/v1/products/{id}', 200, 30, 0, 1600],
  ['GET', '/v1/users/me', 200, 22, 0, 900],
  ['POST', '/v1/cart/items', 201, 60, 320, 700],
  ['GET', '/v1/orders/{id}', 200, 38, 0, 2100],
];

function normalTraffic(startMs, minutes) {
  const events = [];
  for (let m = 0; m < minutes; m++) {
    for (let c = 1; c <= 6; c++) {
      for (let k = 0; k < 3; k++) {
        const [method, route, status, latency, req, resp] = ROUTES[(m + c + k) % ROUTES.length];
        const jitter = 0.8 + ((m * 7 + c * 13 + k * 5) % 9) / 20;
        events.push({
          id: `e2e-${run}-n-${m}-${c}-${k}`,
          timestamp: new Date(startMs + m * 60_000 + c * 4_000 + k * 15_000).toISOString(),
          method,
          route,
          statusCode: (m + c + k) % 41 === 0 ? 404 : status,
          latencyMs: Math.round(latency * jitter),
          requestBytes: Math.round(req * jitter),
          responseBytes: Math.round(resp * jitter),
          clientId: `e2e_client_${c}`,
        });
      }
    }
  }
  return events;
}

function credentialStuffing(startMs, count) {
  return Array.from({ length: count }, (_, i) => ({
    id: `e2e-${run}-a-${i}`,
    timestamp: new Date(startMs + i * 300).toISOString(),
    method: 'POST',
    route: '/v1/auth/login',
    statusCode: 401,
    latencyMs: 40 + (i % 7),
    requestBytes: 180,
    responseBytes: 90,
    clientId: 'e2e_attacker',
  }));
}

async function ingestAll(key, events) {
  const totals = { accepted: 0, anomalies: 0 };
  for (let i = 0; i < events.length; i += 100) {
    const res = await call('POST', '/ingest/events', { key, body: { events: events.slice(i, i + 100) } });
    if (res.status !== 201) check(false, 'ingest batch scored (201)', res.body);
    totals.accepted += res.body.data.accepted;
    totals.anomalies += res.body.data.events.filter((e) => e.isAnomaly).length;
  }
  return totals;
}

console.log(`Pulse e2e against ${API}\n`);

const health = await fetch(API.replace(/\/api\/v1$/, '') + '/health').then((r) => r.json()).catch(() => null);
check(health?.status === 'ok', 'API is healthy and connected to MongoDB', health);

const alice = await register('alice');
const bob = await register('bob');

const ml = await call('GET', '/ml/status', { token: alice.token });
check(ml.status === 200 && ml.body.data.model_loaded, 'ML service reachable with a loaded model', ml.body);

const project = await call('POST', '/projects', { token: alice.token, body: { name: `E2E ${run}`, environment: 'staging' } });
check(project.status === 201, 'create project', project.body);
const pid = project.body.data.id;

const keyRes = await call('POST', `/projects/${pid}/keys`, { token: alice.token, body: { name: 'e2e ingest' } });
check(keyRes.status === 201 && /^pulse_[0-9a-f]{12}_/.test(keyRes.body.data.key), 'create API key (secret returned once)', keyRes.body);
const secret = keyRes.body.data.key;
const keyList = await call('GET', `/projects/${pid}/keys`, { token: alice.token });
check(!JSON.stringify(keyList.body).includes(secret.split('_')[2]), 'key listing never contains the secret');

const now = Date.now();
const normal = normalTraffic(now - 40 * 60_000, 30);
const normalResult = await ingestAll(secret, normal);
check(normalResult.accepted === normal.length, `ingest ${normal.length} normal events`, normalResult);
console.log(`    (model flagged ${normalResult.anomalies} of ${normal.length} normal events)`);

const dup = await call('POST', '/ingest/events', { key: secret, body: normal[0] });
check(dup.status === 200 && dup.body.data.duplicates === 1, 'repeated event id is idempotent');

const bad = await call('POST', '/ingest/events', { key: secret, body: { ...normal[1], id: undefined, authorization: 'Bearer x' } });
check(bad.status === 400, 'unknown fields such as authorization are rejected', bad.body);

const attack = credentialStuffing(now - 5 * 60_000, 120);
const attackResult = await ingestAll(secret, attack);
check(attackResult.anomalies > attack.length / 2, `credential stuffing flagged (${attackResult.anomalies}/${attack.length})`, attackResult);

const alerts = await call('GET', `/projects/${pid}/alerts?limit=100`, { token: alice.token });
const alert = alerts.body.data?.find((a) => a.clientId === 'e2e_attacker');
check(alerts.status === 200 && alert, 'alert raised for the attacking client', alerts.body);
check(alert.eventCount > 10, `related anomalies grouped into one alert (${alert.eventCount} events)`, alert);

const detail = await call('GET', `/projects/${pid}/alerts/${alert.id}`, { token: alice.token });
check(detail.status === 200 && detail.body.data.alert.evidence.length > 0, 'alert detail carries observed evidence', detail.body);

const inv = await call('PATCH', `/projects/${pid}/alerts/${alert.id}`, { token: alice.token, body: { status: 'investigating' } });
check(inv.status === 200 && inv.body.data.status === 'investigating', 'move alert to investigating', inv.body);
const noNote = await call('PATCH', `/projects/${pid}/alerts/${alert.id}`, { token: alice.token, body: { status: 'resolved' } });
check(noNote.status === 400, 'resolving without a note is rejected', noNote.body);
const resolved = await call('PATCH', `/projects/${pid}/alerts/${alert.id}`, {
  token: alice.token,
  body: { status: 'resolved', note: 'Blocked the client at the gateway (e2e).' },
});
check(resolved.status === 200 && resolved.body.data.status === 'resolved', 'resolve alert with a note', resolved.body);

const overview = await call('GET', `/projects/${pid}/analytics/overview?range=1h`, { token: alice.token });
check(overview.status === 200 && overview.body.data.totals.requests >= normal.length + attack.length - 1, 'analytics overview aggregates the ingested events', overview.body?.data?.totals);

// Cross-user isolation: Bob cannot see or touch Alice's resources.
for (const path of [`/projects/${pid}`, `/projects/${pid}/events`, `/projects/${pid}/alerts/${alert.id}`, `/projects/${pid}/keys`]) {
  const r = await call('GET', path, { token: bob.token });
  check(r.status === 404, `bob gets 404 for ${path.replace(pid, ':project').replace(alert.id, ':alert')}`, r.body);
}

// Refresh rotation and reuse detection.
const rotated = await call('POST', '/auth/refresh', { cookie: alice.cookie, csrf: alice.csrf });
check(rotated.status === 200, 'refresh rotates the session', rotated.body);
const replay = await call('POST', '/auth/refresh', { cookie: alice.cookie, csrf: alice.csrf });
check(replay.status === 401, 'replaying the old refresh token is rejected', replay.body);
const afterReuse = await call('GET', '/auth/me', { token: rotated.body.data.accessToken });
check(afterReuse.status === 401, 'token reuse revokes the whole session', afterReuse.body);

const login = await call('POST', '/auth/login', { body: { email: `e2e-alice-${run}@example.com`, password: `E2e-${run}-pass-9` } });
check(login.status === 200, 'sign in again');
const token = login.body.data.accessToken;

const revoke = await call('DELETE', `/projects/${pid}/keys/${keyRes.body.data.apiKey.id}`, { token });
check(revoke.status === 200 || revoke.status === 204, 'revoke API key', revoke.body);
const afterRevoke = await call('POST', '/ingest/events', { key: secret, body: { ...normal[2], id: `e2e-${run}-late` } });
check(afterRevoke.status === 401, 'revoked key can no longer ingest', afterRevoke.body);

const del = await call('DELETE', `/projects/${pid}`, { token });
check(del.status === 204, 'delete project (cascades events, alerts, keys)');

console.log(`\nAll ${passed} checks passed.`);
