import { Router } from 'express';
import * as alerts from '../controllers/alert.controller.js';
import * as analytics from '../controllers/analytics.controller.js';
import * as keys from '../controllers/apiKey.controller.js';
import * as auth from '../controllers/auth.controller.js';
import * as events from '../controllers/event.controller.js';
import * as ml from '../controllers/ml.controller.js';
import * as projects from '../controllers/project.controller.js';
import { apiKeyAuth } from '../middleware/apiKeyAuth.js';
import { authenticate } from '../middleware/authenticate.js';
import { requireAllowedOrigin, requireCsrf } from '../middleware/csrf.js';
import { loadProject } from '../middleware/loadProject.js';
import type { RateLimiters } from '../middleware/rateLimits.js';

export function buildRouter(limits: RateLimiters): Router {
  const r = Router();

  // --- Authentication and sessions -------------------------------------------------
  r.post('/auth/register', requireAllowedOrigin, limits.register, auth.register);
  r.post('/auth/login', requireAllowedOrigin, limits.login, auth.login);
  r.post('/auth/refresh', requireAllowedOrigin, limits.refresh, requireCsrf, auth.refresh);
  r.post('/auth/logout', requireAllowedOrigin, requireCsrf, auth.logout);
  r.get('/auth/me', authenticate, auth.me);
  r.get('/auth/sessions', authenticate, auth.sessions);
  r.post('/auth/sessions/revoke-others', authenticate, auth.revokeOtherSessions);
  r.delete('/auth/sessions/:sessionId', authenticate, auth.revokeSession);
  r.post('/auth/password', authenticate, limits.sensitive, auth.changePassword);

  // --- Ingestion (API key) ------------------------------------------------------------
  r.post('/ingest/events', apiKeyAuth('events:write'), limits.ingest, events.ingest);

  // --- Projects -------------------------------------------------------------------------
  r.get('/projects', authenticate, projects.list);
  r.post('/projects', authenticate, projects.create);
  r.post('/projects/demo', authenticate, limits.sensitive, projects.createDemo);

  const p = Router({ mergeParams: true });
  p.use(authenticate, loadProject);
  p.get('/', projects.get);
  p.patch('/', projects.update);
  p.delete('/', projects.remove);

  p.get('/keys', keys.list);
  p.post('/keys', limits.sensitive, keys.create);
  p.delete('/keys/:keyId', keys.revoke);

  p.get('/events', events.list);
  p.post('/events/reprocess', limits.sensitive, events.reprocess);
  p.get('/events/:eventId', events.get);

  p.get('/alerts', alerts.list);
  p.get('/alerts/:alertId', alerts.get);
  p.patch('/alerts/:alertId', alerts.updateStatus);

  p.get('/analytics/overview', analytics.getOverview);
  p.get('/analytics/scores', analytics.getScoreDistribution);
  r.use('/projects/:projectId', p);

  // --- Model operations ------------------------------------------------------------------
  r.get('/ml/status', authenticate, ml.status);
  r.get('/ml/model', authenticate, ml.modelInfo);
  r.get('/ml/evaluation', authenticate, ml.evaluation);
  r.post('/ml/evaluation', authenticate, limits.evaluation, ml.runEvaluation);

  return r;
}
