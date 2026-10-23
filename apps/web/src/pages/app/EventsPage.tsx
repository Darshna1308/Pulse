import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Activity, FilterX, Search } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { eventsApi, type EventFilters } from '@/api/endpoints';
import type { ApiEvent } from '@/api/types';
import { EventDetailModal } from '@/components/EventDetail';
import { PageHeader } from '@/components/layout/PageHeader';
import { RequireProject } from '@/components/NoProject';
import { Badge, MethodBadge, StatusCode } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input, Select } from '@/components/ui/Field';
import { Pagination } from '@/components/ui/Misc';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/States';
import { cn } from '@/lib/cn';
import { fmtBytes, fmtDateTime, fmtMs, fmtScore } from '@/lib/format';
import { useProject } from '@/lib/useProject';

const FILTER_KEYS = ['method', 'statusClass', 'route', 'clientId', 'anomaly', 'processing'] as const;

function useDebounced<T>(value: T, ms = 300) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

function Events({ projectId }: { projectId: string }) {
  const { project } = useProject();
  const [params, setParams] = useSearchParams();
  const [routeInput, setRouteInput] = useState(params.get('route') ?? '');
  const [clientInput, setClientInput] = useState(params.get('clientId') ?? '');
  const route = useDebounced(routeInput);
  const clientId = useDebounced(clientInput);
  const [selected, setSelected] = useState<ApiEvent | null>(null);

  const set = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key !== 'page') next.delete('page');
    setParams(next, { replace: true });
  };

  useEffect(() => {
    if ((params.get('route') ?? '') !== route) set('route', route);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route]);
  useEffect(() => {
    if ((params.get('clientId') ?? '') !== clientId) set('clientId', clientId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  const filters: EventFilters = { page: Number(params.get('page') ?? 1), pageSize: 25 };
  FILTER_KEYS.forEach((k) => {
    const v = params.get(k);
    if (v) filters[k] = v;
  });
  const active = FILTER_KEYS.some((k) => params.get(k));

  const query = useQuery({
    queryKey: ['events', projectId, filters],
    queryFn: () => eventsApi.list(projectId, filters),
    placeholderData: keepPreviousData,
  });

  return (
    <>
      <PageHeader
        title="API events"
        description="Every ingested request with its model score. Click a row for context and evidence."
        simulated={project?.isDemo}
      />
      <Card>
        <div className="grid gap-2 border-b border-line p-3 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_repeat(4,minmax(0,0.8fr))_auto]">
          <label className="relative">
            <span className="sr-only">Search route</span>
            <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-4" aria-hidden />
            <Input value={routeInput} onChange={(e) => setRouteInput(e.target.value)} placeholder="Route contains…" className="pl-8" />
          </label>
          <label>
            <span className="sr-only">Client id</span>
            <Input value={clientInput} onChange={(e) => setClientInput(e.target.value)} placeholder="Client id" />
          </label>
          <Select aria-label="Method" value={params.get('method') ?? ''} onChange={(e) => set('method', e.target.value)}>
            <option value="">All methods</option>
            {['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].map((m) => (
              <option key={m}>{m}</option>
            ))}
          </Select>
          <Select aria-label="Status class" value={params.get('statusClass') ?? ''} onChange={(e) => set('statusClass', e.target.value)}>
            <option value="">All statuses</option>
            {['2xx', '3xx', '4xx', '5xx'].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </Select>
          <Select aria-label="Model verdict" value={params.get('anomaly') ?? ''} onChange={(e) => set('anomaly', e.target.value)}>
            <option value="">All verdicts</option>
            <option value="true">Anomalous</option>
            <option value="false">Not flagged</option>
          </Select>
          <Select aria-label="Processing" value={params.get('processing') ?? ''} onChange={(e) => set('processing', e.target.value)}>
            <option value="">Any processing</option>
            <option value="scored">Scored</option>
            <option value="failed">Failed</option>
            <option value="pending">Pending</option>
          </Select>
          <Button
            variant="ghost"
            disabled={!active}
            onClick={() => {
              setRouteInput('');
              setClientInput('');
              setParams(new URLSearchParams(), { replace: true });
            }}
            icon={<FilterX size={14} aria-hidden />}
          >
            Reset
          </Button>
        </div>

        {query.error ? (
          <ErrorState error={query.error} onRetry={() => void query.refetch()} />
        ) : query.isLoading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 8 }, (_, i) => (
              <Skeleton key={i} className="h-9" />
            ))}
          </div>
        ) : !query.data?.items.length ? (
          <EmptyState
            icon={<Activity size={20} aria-hidden />}
            title={active ? 'No events match these filters' : 'No events yet'}
            description={active ? 'Try widening or resetting the filters.' : 'Events appear here as soon as your API sends them with a project key.'}
          />
        ) : (
          <div className={cn('overflow-x-auto transition-opacity', query.isPlaceholderData && 'opacity-60')}>
            <table className="w-full min-w-[860px] text-left text-[13px]">
              <thead>
                <tr className="border-b border-line text-2xs uppercase tracking-wider text-ink-3">
                  <th className="px-5 py-2.5 font-medium">Time</th>
                  <th className="px-3 py-2.5 font-medium">Endpoint</th>
                  <th className="px-3 py-2.5 font-medium">Status</th>
                  <th className="px-3 py-2.5 text-right font-medium">Latency</th>
                  <th className="px-3 py-2.5 text-right font-medium">Response</th>
                  <th className="px-3 py-2.5 font-medium">Client</th>
                  <th className="px-3 py-2.5 text-right font-medium">Score</th>
                  <th className="px-5 py-2.5 font-medium">Verdict</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {query.data.items.map((e) => (
                  <tr
                    key={e.id}
                    tabIndex={0}
                    onClick={() => setSelected(e)}
                    onKeyDown={(k) => k.key === 'Enter' && setSelected(e)}
                    className={cn('cursor-pointer hover:bg-surface focus:bg-surface', e.prediction?.isAnomaly && 'bg-violet-200/10')}
                  >
                    <td className="whitespace-nowrap px-5 py-2.5 text-ink-2 tabular">{fmtDateTime(e.timestamp)}</td>
                    <td className="max-w-[280px] px-3 py-2.5">
                      <span className="flex items-center gap-2">
                        <MethodBadge method={e.method} />
                        <span className="truncate font-mono text-xs">{e.route}</span>
                      </span>
                    </td>
                    <td className="px-3 py-2.5">
                      <StatusCode code={e.statusCode} />
                    </td>
                    <td className="px-3 py-2.5 text-right tabular">{fmtMs(e.latencyMs)}</td>
                    <td className="px-3 py-2.5 text-right tabular text-ink-2">{fmtBytes(e.responseBytes)}</td>
                    <td className="max-w-[140px] truncate px-3 py-2.5 font-mono text-xs text-ink-2">{e.clientId}</td>
                    <td className="px-3 py-2.5 text-right font-mono text-xs tabular">{fmtScore(e.prediction?.score)}</td>
                    <td className="px-5 py-2.5">
                      {e.processing.status === 'failed' ? (
                        <Badge tone="warn">Scoring failed</Badge>
                      ) : e.processing.status === 'pending' ? (
                        <Badge>Pending</Badge>
                      ) : e.prediction?.isAnomaly ? (
                        <Badge tone="violet">Anomalous</Badge>
                      ) : (
                        <span className="text-xs text-ink-4">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pagination meta={query.data?.meta} onPage={(p) => set('page', String(p))} />
      </Card>
      <EventDetailModal projectId={projectId} event={selected} onClose={() => setSelected(null)} />
    </>
  );
}

export default function EventsPage() {
  return <RequireProject>{(id) => <Events key={id} projectId={id} />}</RequireProject>;
}
