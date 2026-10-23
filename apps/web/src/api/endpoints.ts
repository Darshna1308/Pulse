import { api, type SessionPayload } from './client';
import type {
  Alert,
  AlertStatus,
  AlertSummary,
  ApiEvent,
  ApiKey,
  EvaluationReport,
  ModelInfo,
  Overview,
  PageMeta,
  Project,
  RangeKey,
  ScoreBucket,
  Session,
  User,
} from './types';

const paged = <T,>(r: { data: T; meta?: unknown }) => ({ items: r.data, meta: r.meta as PageMeta });

export const authApi = {
  register: (body: { name: string; email: string; password: string }) =>
    api<SessionPayload>('/auth/register', { method: 'POST', body, auth: false }).then((r) => r.data),
  login: (body: { email: string; password: string }) =>
    api<SessionPayload>('/auth/login', { method: 'POST', body, auth: false }).then((r) => r.data),
  logout: () => api<null>('/auth/logout', { method: 'POST', auth: false, csrf: true }),
  me: () => api<{ user: User; sessionId: string }>('/auth/me').then((r) => r.data),
  sessions: () => api<Session[]>('/auth/sessions').then((r) => r.data),
  revokeSession: (id: string) => api<null>(`/auth/sessions/${id}`, { method: 'DELETE' }),
  revokeOthers: () => api<{ revoked: number }>('/auth/sessions/revoke-others', { method: 'POST' }).then((r) => r.data),
  changePassword: (body: { currentPassword: string; newPassword: string }) =>
    api<{ changed: boolean }>('/auth/password', { method: 'POST', body }),
};

export const projectsApi = {
  list: () => api<Project[]>('/projects').then((r) => r.data),
  create: (body: { name: string; description?: string; environment?: Project['environment'] }) =>
    api<Project>('/projects', { method: 'POST', body }).then((r) => r.data),
  update: (id: string, body: Partial<Pick<Project, 'name' | 'description' | 'environment'>>) =>
    api<Project>(`/projects/${id}`, { method: 'PATCH', body }).then((r) => r.data),
  remove: (id: string) => api<null>(`/projects/${id}`, { method: 'DELETE' }),
  createDemo: () =>
    api<{ project: Project; events: number; anomalies: number; alertsCreated: number; failed: number }>('/projects/demo', {
      method: 'POST',
    }).then((r) => r.data),
};

export const keysApi = {
  list: (projectId: string) => api<ApiKey[]>(`/projects/${projectId}/keys`).then((r) => r.data),
  create: (projectId: string, name: string) =>
    api<{ apiKey: ApiKey; key: string }>(`/projects/${projectId}/keys`, { method: 'POST', body: { name } }).then((r) => r.data),
  revoke: (projectId: string, keyId: string) =>
    api<ApiKey>(`/projects/${projectId}/keys/${keyId}`, { method: 'DELETE' }).then((r) => r.data),
};

export interface EventFilters {
  page?: number;
  pageSize?: number;
  method?: string;
  statusClass?: string;
  route?: string;
  clientId?: string;
  anomaly?: string;
  processing?: string;
}

export const eventsApi = {
  list: (projectId: string, filters: EventFilters) =>
    api<ApiEvent[]>(`/projects/${projectId}/events`, { query: { ...filters } }).then(paged),
  get: (projectId: string, eventId: string) =>
    api<{ event: ApiEvent; alert: { id: string; title: string; status: AlertStatus; severity: string } | null }>(
      `/projects/${projectId}/events/${eventId}`,
    ).then((r) => r.data),
  reprocess: (projectId: string) =>
    api<{ attempted: number; score: { status: string; scored: number; failed: number } | null }>(
      `/projects/${projectId}/events/reprocess`,
      { method: 'POST' },
    ).then((r) => r.data),
};

export const alertsApi = {
  list: (projectId: string, q: { page?: number; pageSize?: number; status?: string; severity?: string }) =>
    api<AlertSummary[]>(`/projects/${projectId}/alerts`, { query: q }).then(paged),
  get: (projectId: string, alertId: string) =>
    api<{ alert: Alert; events: ApiEvent[] }>(`/projects/${projectId}/alerts/${alertId}`).then((r) => r.data),
  update: (projectId: string, alertId: string, body: { status: AlertStatus; note?: string }) =>
    api<Alert>(`/projects/${projectId}/alerts/${alertId}`, { method: 'PATCH', body }).then((r) => r.data),
};

export const analyticsApi = {
  overview: (projectId: string, range: RangeKey) =>
    api<Overview>(`/projects/${projectId}/analytics/overview`, { query: { range } }).then((r) => r.data),
  scores: (projectId: string, range: RangeKey) =>
    api<ScoreBucket[]>(`/projects/${projectId}/analytics/scores`, { query: { range } }).then((r) => r.data),
};

export const mlApi = {
  status: () => api<{ status: string; model_loaded: boolean; model_version: string | null }>('/ml/status').then((r) => r.data),
  model: () =>
    api<{ model: ModelInfo; versionsSeen: { version: string; threshold: number; predictions: number; firstSeenAt: string; lastSeenAt: string }[] }>(
      '/ml/model',
    ).then((r) => r.data),
  evaluation: () => api<EvaluationReport | null>('/ml/evaluation').then((r) => r.data),
  runEvaluation: () => api<EvaluationReport>('/ml/evaluation', { method: 'POST' }).then((r) => r.data),
};
