export type Severity = 'medium' | 'high' | 'critical';
export type AlertStatus = 'open' | 'investigating' | 'resolved' | 'dismissed';
export type RangeKey = '1h' | '24h' | '7d' | '30d';

export interface User {
  id: string;
  email: string;
  name: string;
  createdAt?: string;
}

export interface Project {
  id: string;
  name: string;
  description: string;
  environment: 'production' | 'staging' | 'development';
  isDemo: boolean;
  createdAt: string;
  updatedAt: string;
  stats?: { events: number; lastEventAt: string | null; unresolvedAlerts: number };
}

export interface ApiKey {
  id: string;
  name: string;
  prefix: string;
  scopes: string[];
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
  status: 'active' | 'revoked';
}

export interface Evidence {
  metric: string;
  label: string;
  unit: string;
  value: number | null;
  baseline_median: number | null;
  baseline_p99: number | null;
  ratio_to_median: number | null;
  summary: string;
}

export interface Attribution {
  feature: string;
  label: string;
  contribution: number;
}

export interface Prediction {
  score: number;
  isAnomaly: boolean;
  severity: Severity | null;
  percentile: number;
  detectedBy: ('model' | 'guardrail')[];
  modelVersion: string;
  threshold: number;
  patternCode?: string;
  patternTitle?: string;
}

export interface ApiEvent {
  id: string;
  externalId: string | null;
  timestamp: string;
  method: string;
  route: string;
  statusCode: number;
  latencyMs: number;
  requestBytes: number;
  responseBytes: number;
  clientId: string;
  source: 'api_key' | 'demo';
  simulatedScenario: string | null;
  context: Record<string, number | null> | null;
  processing: { status: 'pending' | 'scored' | 'failed'; error: string | null; attempts: number };
  prediction: Prediction | null;
  alertId: string | null;
}

export interface AlertSummary {
  id: string;
  status: AlertStatus;
  severity: Severity;
  title: string;
  patternCode: string;
  clientId: string;
  method: string | null;
  route: string | null;
  score: number;
  threshold: number | null;
  percentile: number | null;
  modelVersion: string | null;
  detectedBy: ('model' | 'guardrail')[];
  eventCount: number;
  firstSeenAt: string;
  lastSeenAt: string;
  simulated: boolean;
  resolution: { note: string | null; at: string } | null;
  createdAt: string;
  updatedAt: string;
}

export interface Alert extends AlertSummary {
  evidence: Evidence[];
  attributions: Attribution[];
  statusHistory: { from: string | null; to: string; note: string | null; changedBy: string | null; at: string }[];
}

export interface PageMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface Overview {
  range: RangeKey;
  from: string;
  to: string;
  bucketMs: number;
  totals: {
    requests: number;
    errors: number;
    errorRate: number | null;
    serverErrorRate: number | null;
    avgLatencyMs: number | null;
    p50LatencyMs: number | null;
    p95LatencyMs: number | null;
    p99LatencyMs: number | null;
    anomalies: number;
    scored: number;
    failedScoring: number;
  };
  alerts: {
    open: number;
    investigating: number;
    resolved: number;
    dismissed: number;
    unresolved: number;
    unresolvedBySeverity: Partial<Record<Severity, number>>;
  };
  series: { bucket: string; requests: number; errors: number; anomalies: number; avgLatencyMs: number | null }[];
  statusDistribution: { statusClass: string; count: number }[];
  topEndpoints: { method: string; route: string; requests: number; errorRate: number; anomalies: number; avgLatencyMs: number }[];
  topClients: { clientId: string; requests: number; errorRate: number; anomalies: number; maxScore: number | null }[];
}

export interface ScoreBucket {
  from: number;
  to: number;
  count: number;
  anomalies: number;
}

export interface Session {
  id: string;
  userAgent: string | null;
  ipAddress: string | null;
  createdAt: string;
  lastUsedAt: string;
  expiresAt: string;
  current: boolean;
}

export interface MetricSet {
  precision: number;
  recall: number;
  f1: number;
  false_positive_rate: number;
  roc_auc: number;
  average_precision: number;
  confusion: { tp: number; fp: number; fn: number; tn: number };
  flagged: number;
  threshold?: number;
  per_scenario: Record<string, { title: string; events: number; recall: number; incidents: number; incidents_detected: number }>;
  incident_level: { incidents: number; detected: number; recall: number };
}

export interface EvaluationReport {
  evaluated_at: string;
  model_version: string;
  dataset: {
    kind: string;
    seed: number;
    start: string;
    minutes: number;
    events: number;
    anomalous_events: number;
    anomaly_rate: number;
    incidents: number;
    training_seed: number;
    overlap_with_training: string;
  };
  alert_quantile: number;
  isolation_forest: MetricSet & { score_median: { normal: number; anomalous: number } };
  hybrid_policy: MetricSet & { name: string; guardrail_factor: number; guardrail_only_flags: number };
  baseline: MetricSet & { name: string };
  notes: string[];
}

export interface ModelInfo {
  version: string;
  algorithm: string;
  trained_at: string;
  sklearn_version: string;
  training: { dataset: string; seed: number; minutes: number; clients: number; incidents_unlabelled: number; rows: number };
  hyperparameters: Record<string, string | number>;
  threshold: number;
  alert_quantile: number;
  guardrail: { factor: number; metrics: string[]; description: string };
  severity_thresholds: { high: number; critical: number };
  features: { name: string; label: string }[];
  score_interpretation: string;
}
