import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Types } from 'mongoose';
import { describe, expect, it } from 'vitest';
import { ApiEventModel } from '../src/models/apiEvent.model.js';
import { computeContext } from '../src/services/context.service.js';
import { useTestApp } from './helpers.js';

useTestApp();

const fixturePath = fileURLToPath(new URL('../../../services/ml/tests/fixtures/context_parity.json', import.meta.url));
const fixture = JSON.parse(readFileSync(fixturePath, 'utf8')) as {
  events: { ts_ms: number; client_id: string; method: string; route: string; status_code: number; latency_ms: number; request_bytes: number; response_bytes: number }[];
  expected: Record<string, number | null>[];
};

describe('context parity with the Python feature pipeline', () => {
  it('matches services/ml/tests/fixtures/context_parity.json', async () => {
    const projectId = new Types.ObjectId();
    await ApiEventModel.insertMany(
      fixture.events.map((e) => ({
        projectId,
        timestamp: new Date(e.ts_ms),
        method: e.method,
        route: e.route,
        statusCode: e.status_code,
        latencyMs: e.latency_ms,
        requestBytes: e.request_bytes,
        responseBytes: e.response_bytes,
        clientId: e.client_id,
        source: 'demo',
      })),
    );

    for (const [i, e] of fixture.events.entries()) {
      const got = await computeContext({ projectId, clientId: e.client_id, method: e.method, route: e.route, timestamp: new Date(e.ts_ms) });
      const want = fixture.expected[i]!;
      expect(got.clientRequests1m, `event ${i}`).toBe(want.client_requests_1m);
      expect(got.clientRequests5m, `event ${i}`).toBe(want.client_requests_5m);
      expect(got.clientErrors5m, `event ${i}`).toBe(want.client_errors_5m);
      expect(got.clientAuthFailures5m, `event ${i}`).toBe(want.client_auth_failures_5m);
      expect(got.clientDistinctRoutes5m, `event ${i}`).toBe(want.client_distinct_routes_5m);
      for (const [mine, theirs] of [
        ['routeLatencyBaselineMs', 'route_latency_baseline_ms'],
        ['routeRequestBytesBaseline', 'route_request_bytes_baseline'],
        ['routeResponseBytesBaseline', 'route_response_bytes_baseline'],
      ] as const) {
        const w = want[theirs];
        if (w === null || w === undefined) expect(got[mine], `event ${i} ${mine}`).toBeNull();
        // MongoDB's $median is approximate; Python's is exact. Allow a small relative gap.
        else expect(Math.abs((got[mine] as number) - w), `event ${i} ${mine}`).toBeLessThanOrEqual(Math.max(1, Math.abs(w) * 0.15));
      }
    }
  });
});
