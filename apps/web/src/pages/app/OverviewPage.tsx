import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Activity, ArrowRight, KeyRound, RefreshCw, ServerCrash, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { alertsApi, analyticsApi, eventsApi, mlApi } from '@/api/endpoints';
import type { RangeKey } from '@/api/types';
import { AnomalyBars, Legend, StatusBars, TrafficChart } from '@/components/charts/Charts';
import { CHART } from '@/components/charts/palette';
import { DemoButton } from '@/components/DemoButton';
import { IngestSnippet } from '@/components/IngestSnippet';
import { PageHeader } from '@/components/layout/PageHeader';
import { RequireProject } from '@/components/NoProject';
import { MethodBadge, SeverityBadge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { Segmented } from '@/components/ui/Misc';
import { StatTile } from '@/components/ui/StatTile';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/States';
import { useToast } from '@/components/ui/Toast';
import { fmtMs, fmtNumber, fmtPercent, fmtRelative, fmtScore } from '@/lib/format';
import { useProject } from '@/lib/useProject';

export const RANGE_OPTIONS: { value: RangeKey; label: string }[] = [
  { value: '1h', label: '1h' },
  { value: '24h', label: '24h' },
  { value: '7d', label: '7d' },
  { value: '30d', label: '30d' },
];

function MlBanner() {
  const { data } = useQuery({ queryKey: ['ml-status'], queryFn: mlApi.status, refetchInterval: 30_000 });
  if (!data || data.model_loaded) return null;
  return (
    <div role="alert" className="mb-4 flex items-start gap-3 rounded-lg border border-serious/20 bg-serious-soft px-4 py-3 text-sm text-serious">
      <ServerCrash size={16} className="mt-0.5 shrink-0" aria-hidden />
      <div>
        <p className="font-medium">The ML service is {data.status === 'unreachable' ? 'unreachable' : 'running without a trained model'}.</p>
        <p className="mt-0.5 text-xs">New events are stored but marked as failed until scoring is available. Nothing is scored with placeholder values.</p>
      </div>
    </div>
  );
}

function FailedScoringBanner({ projectId, count }: { projectId: string; count: number }) {
  const qc = useQueryClient();
  const notify = useToast();
  const retry = useMutation({
    mutationFn: () => eventsApi.reprocess(projectId),
    onSuccess: (r) => {
      void qc.invalidateQueries();
      if (r.score?.status === 'scored') notify(`Scored ${r.score.scored} events.`);
      else notify('The ML service is still unavailable.', 'error');
    },
    onError: () => notify('Retry failed.', 'error'),
  });
  if (!count) return null;
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-warn/25 bg-warn-soft px-4 py-3 text-sm text-warn">
      <span>
        <strong>{fmtNumber(count)}</strong> events in this range could not be scored because the ML service was unavailable.
      </span>
      <Button size="sm" variant="secondary" loading={retry.isPending} onClick={() => retry.mutate()} icon={<RefreshCw size={14} aria-hidden />}>
        Retry scoring
      </Button>
    </div>
  );
}

function Onboarding({ isDemo }: { isDemo: boolean }) {
  return (
    <Card>
      <EmptyState
        icon={<Activity size={20} aria-hidden />}
        title="No API events in this project yet"
        description={
          isDemo
            ? 'This demo project has no events in the selected range. Try a wider range.'
            : 'Create an API key and send request metadata from your API or gateway. Pulse scores each event as it arrives.'
        }
        action={
          !isDemo && (
            <>
              <Link to="/app/keys">
                <Button icon={<KeyRound size={15} aria-hidden />}>Create an API key</Button>
              </Link>
              <DemoButton icon={<Sparkles size={15} aria-hidden />} label="Or explore a demo project" />
            </>
          )
        }
      />
      {!isDemo && (
        <div className="border-t border-line px-5 py-5">
          <p className="mb-3 text-xs font-medium text-ink-2">Send your first event</p>
          <IngestSnippet />
        </div>
      )}
    </Card>
  );
}

function Overview({ projectId }: { projectId: string }) {
  const { project } = useProject();
  const [range, setRange] = useState<RangeKey>('24h');
  const overview = useQuery({ queryKey: ['overview', projectId, range], queryFn: () => analyticsApi.overview(projectId, range), refetchInterval: 60_000 });
  const alerts = useQuery({ queryKey: ['alerts', projectId, 'overview'], queryFn: () => alertsApi.list(projectId, { status: 'active', pageSize: 5 }) });

  const d = overview.data;
  const loading = overview.isLoading;
  const empty = d && d.totals.requests === 0 && (project?.stats?.events ?? 0) === 0;

  return (
    <>
      <PageHeader
        title="Overview"
        description={`Traffic, model detections and open alerts for ${project?.name ?? 'this project'}.`}
        simulated={project?.isDemo}
        actions={
          <>
            <Segmented label="Time range" value={range} options={RANGE_OPTIONS} onChange={setRange} />
            <Button
              variant="secondary"
              size="sm"
              aria-label="Refresh"
              onClick={() => void Promise.all([overview.refetch(), alerts.refetch()])}
              icon={<RefreshCw size={14} className={overview.isFetching ? 'animate-spin' : ''} aria-hidden />}
            />
          </>
        }
      />
      <MlBanner />
      {d && <FailedScoringBanner projectId={projectId} count={d.totals.failedScoring} />}

      {overview.error ? (
        <Card>
          <ErrorState error={overview.error} onRetry={() => void overview.refetch()} />
        </Card>
      ) : empty ? (
        <Onboarding isDemo={!!project?.isDemo} />
      ) : (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <StatTile label="Requests" loading={loading} value={fmtNumber(d?.totals.requests)} sub={`in the last ${range}`} />
            <StatTile
              label="Error rate"
              loading={loading}
              value={fmtPercent(d?.totals.errorRate)}
              sub={d ? `${fmtPercent(d.totals.serverErrorRate)} server errors` : null}
              info="Share of responses with status 400 or higher."
            />
            <StatTile
              label="p95 latency"
              loading={loading}
              value={fmtMs(d?.totals.p95LatencyMs)}
              sub={d ? `median ${fmtMs(d.totals.p50LatencyMs)} · avg ${fmtMs(d.totals.avgLatencyMs)}` : null}
              info="Approximate percentiles computed by MongoDB over the selected range."
            />
            <StatTile
              label="Anomalies"
              loading={loading}
              emphasis="violet"
              value={fmtNumber(d?.totals.anomalies)}
              sub={d && d.totals.scored ? `${fmtPercent(d.totals.anomalies / d.totals.scored, 2)} of scored events` : 'no scored events'}
              info="Events the Isolation Forest scored above the alert threshold (or that tripped the magnitude guardrail)."
            />
            <StatTile
              label="Unresolved alerts"
              loading={loading}
              emphasis={d?.alerts.unresolvedBySeverity.critical ? 'critical' : undefined}
              value={fmtNumber(d?.alerts.unresolved)}
              sub={d ? `${d.alerts.unresolvedBySeverity.critical ?? 0} critical · ${d.alerts.unresolvedBySeverity.high ?? 0} high` : null}
            />
          </div>

          <div className="grid gap-5 xl:grid-cols-3">
            <Card className="xl:col-span-2">
              <CardHeader
                title="Request volume"
                description="Requests per interval, with error responses"
                action={<Legend items={[{ label: 'Requests', color: CHART.requests }, { label: 'Errors', color: CHART.errors }]} />}
              />
              <div className="px-3 pb-2 pt-4">{loading || !d ? <Skeleton className="mx-2 h-64" /> : <TrafficChart data={d} />}</div>
              <div className="border-t border-line px-3 pb-3 pt-3">
                <div className="mb-1 flex items-center justify-between px-2">
                  <span className="text-xs font-medium text-ink-2">Anomalous events</span>
                  <Legend items={[{ label: 'Flagged by model', color: CHART.anomalies }]} />
                </div>
                {loading || !d ? <Skeleton className="mx-2 h-28" /> : <AnomalyBars data={d} />}
              </div>
            </Card>

            <div className="space-y-5">
              <Card>
                <CardHeader title="Status codes" description={`Response classes, last ${range}`} />
                <div className="px-5 py-4">{loading || !d ? <Skeleton className="h-32" /> : <StatusBars data={d} />}</div>
              </Card>
              <Card>
                <CardHeader
                  title="Open alerts"
                  action={
                    <Link to="/app/alerts" className="inline-flex items-center gap-1 text-xs font-medium text-cyan-700 hover:text-cyan-800">
                      View all <ArrowRight size={12} aria-hidden />
                    </Link>
                  }
                />
                {alerts.isLoading ? (
                  <div className="space-y-2 p-4">
                    <Skeleton className="h-10" />
                    <Skeleton className="h-10" />
                  </div>
                ) : alerts.data?.items.length ? (
                  <ul className="divide-y divide-line">
                    {alerts.data.items.map((a) => (
                      <li key={a.id}>
                        <Link to={`/app/alerts/${a.id}`} className="block px-5 py-3 hover:bg-surface">
                          <div className="flex items-center justify-between gap-2">
                            <span className="truncate text-[13px] font-medium text-ink">{a.title}</span>
                            <SeverityBadge severity={a.severity} />
                          </div>
                          <div className="mt-1 flex items-center gap-2 text-xs text-ink-3">
                            <span className="truncate font-mono">{a.clientId}</span>
                            <span>·</span>
                            <span>{a.eventCount} events</span>
                            <span>·</span>
                            <span>{fmtRelative(a.lastSeenAt)}</span>
                          </div>
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="px-5 py-6 text-center text-sm text-ink-3">No open alerts. Pulse will raise one when traffic looks unusual.</p>
                )}
              </Card>
            </div>
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            <Card>
              <CardHeader title="Busiest endpoints" description="By request count in range" />
              <div className="overflow-x-auto">
                <table className="w-full text-left text-[13px]">
                  <thead>
                    <tr className="border-b border-line text-2xs uppercase tracking-wider text-ink-3">
                      <th className="px-5 py-2 font-medium">Endpoint</th>
                      <th className="px-3 py-2 text-right font-medium">Requests</th>
                      <th className="px-3 py-2 text-right font-medium">Errors</th>
                      <th className="px-3 py-2 text-right font-medium">Avg latency</th>
                      <th className="px-5 py-2 text-right font-medium">Anomalies</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {d?.topEndpoints.map((e) => (
                      <tr key={e.method + e.route}>
                        <td className="max-w-[240px] px-5 py-2.5">
                          <span className="flex items-center gap-2">
                            <MethodBadge method={e.method} />
                            <span className="truncate font-mono text-xs">{e.route}</span>
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-right tabular">{fmtNumber(e.requests)}</td>
                        <td className="px-3 py-2.5 text-right tabular">{fmtPercent(e.errorRate)}</td>
                        <td className="px-3 py-2.5 text-right tabular">{fmtMs(e.avgLatencyMs)}</td>
                        <td className="px-5 py-2.5 text-right tabular">{e.anomalies ? <span className="font-medium text-violet-700">{fmtNumber(e.anomalies)}</span> : '0'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {loading && <Skeleton className="m-5 h-24" />}
              </div>
            </Card>
            <Card>
              <CardHeader title="Clients to watch" description="Ranked by anomalous events, then volume" />
              <div className="overflow-x-auto">
                <table className="w-full text-left text-[13px]">
                  <thead>
                    <tr className="border-b border-line text-2xs uppercase tracking-wider text-ink-3">
                      <th className="px-5 py-2 font-medium">Client</th>
                      <th className="px-3 py-2 text-right font-medium">Requests</th>
                      <th className="px-3 py-2 text-right font-medium">Errors</th>
                      <th className="px-3 py-2 text-right font-medium">Max score</th>
                      <th className="px-5 py-2 text-right font-medium">Anomalies</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {d?.topClients.map((c) => (
                      <tr key={c.clientId}>
                        <td className="px-5 py-2.5">
                          <Link to={`/app/events?clientId=${encodeURIComponent(c.clientId)}`} className="font-mono text-xs text-cyan-700 hover:underline">
                            {c.clientId}
                          </Link>
                        </td>
                        <td className="px-3 py-2.5 text-right tabular">{fmtNumber(c.requests)}</td>
                        <td className="px-3 py-2.5 text-right tabular">{fmtPercent(c.errorRate)}</td>
                        <td className="px-3 py-2.5 text-right font-mono text-xs tabular">{fmtScore(c.maxScore)}</td>
                        <td className="px-5 py-2.5 text-right tabular">{c.anomalies ? <span className="font-medium text-violet-700">{fmtNumber(c.anomalies)}</span> : '0'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {loading && <Skeleton className="m-5 h-24" />}
              </div>
            </Card>
          </div>
        </div>
      )}
    </>
  );
}

export default function OverviewPage() {
  return <RequireProject>{(id) => <Overview key={id} projectId={id} />}</RequireProject>;
}

