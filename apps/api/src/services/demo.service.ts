import { conflict, forbidden, AppError } from '../lib/errors.js';
import { env } from '../config/env.js';
import { ProjectModel, publicProject } from '../models/project.model.js';
import { ingestEvents, type IngestEvent } from './ingestion.service.js';
import { MlUnavailableError, mlClient } from './ml.client.js';

export const DEMO_SEED = 2026;
const DEMO_CHUNK = 250;

/**
 * Create a separate, clearly labelled demo project and fill it with simulated traffic
 * from the ML service's synthetic generator. The traffic is ingested through the same
 * pipeline as real events (context, ML scoring, alerts). It never touches existing projects.
 */
export async function createDemoProject(userId: string, opts: { minutes?: number; seed?: number } = {}) {
  if (!env().allowDemoData) throw forbidden('Demo data is disabled on this deployment', 'demo_disabled');
  if (await ProjectModel.exists({ ownerId: userId, isDemo: true })) {
    throw conflict('You already have a demo project. Delete it to generate a fresh one.', 'demo_exists');
  }

  let synthetic;
  try {
    synthetic = await mlClient.synthetic({
      seed: opts.seed ?? DEMO_SEED,
      minutes: opts.minutes ?? 240,
      clients: 8,
      incidents: 4,
      end_time: new Date().toISOString(),
    });
  } catch (err) {
    if (err instanceof MlUnavailableError) {
      throw new AppError(503, 'ml_unavailable', 'The ML service is unavailable, so demo traffic cannot be generated right now.');
    }
    throw err;
  }

  const project = await ProjectModel.create({
    ownerId: userId,
    name: 'Demo · Simulated traffic',
    description: 'Simulated API traffic from the Pulse synthetic generator, including injected incidents. Not real data.',
    environment: 'development',
    isDemo: true,
  });

  const events: IngestEvent[] = synthetic.events.map((e) => ({
    timestamp: new Date(e.timestamp),
    method: e.method as IngestEvent['method'],
    route: e.route,
    statusCode: e.status_code,
    latencyMs: e.latency_ms,
    requestBytes: e.request_bytes,
    responseBytes: e.response_bytes,
    clientId: e.client_id,
  }));
  const scenarios = synthetic.events.map((e) => (e.scenario === 'normal' ? undefined : e.scenario));

  const totals = { events: 0, anomalies: 0, alertsCreated: 0, failed: 0 };
  for (let i = 0; i < events.length; i += DEMO_CHUNK) {
    const res = await ingestEvents(project, events.slice(i, i + DEMO_CHUNK), {
      source: 'demo',
      simulatedScenarios: scenarios.slice(i, i + DEMO_CHUNK),
    });
    totals.events += res.accepted;
    totals.anomalies += res.score?.anomalies ?? 0;
    totals.alertsCreated += res.score?.alertsCreated ?? 0;
    totals.failed += res.score?.failed ?? 0;
  }
  return { project: publicProject(project), ...totals };
}
