import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Bell, ChevronRight } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { alertsApi } from '@/api/endpoints';
import { PageHeader } from '@/components/layout/PageHeader';
import { RequireProject } from '@/components/NoProject';
import { AlertStatusBadge, Badge, MethodBadge, SeverityBadge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { Select } from '@/components/ui/Field';
import { Pagination } from '@/components/ui/Misc';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/States';
import { cn } from '@/lib/cn';
import { fmtNumber, fmtRelative, fmtScore } from '@/lib/format';
import { useProject } from '@/lib/useProject';

const TABS = [
  { value: 'active', label: 'Active' },
  { value: 'open', label: 'Open' },
  { value: 'investigating', label: 'Investigating' },
  { value: 'resolved', label: 'Resolved' },
  { value: 'dismissed', label: 'Dismissed' },
  { value: '', label: 'All' },
];

function Alerts({ projectId }: { projectId: string }) {
  const { project } = useProject();
  const [params, setParams] = useSearchParams();
  const status = params.get('status') ?? 'active';
  const severity = params.get('severity') ?? '';
  const page = Number(params.get('page') ?? 1);

  const update = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    next.set(key, value);
    if (key !== 'page') next.delete('page');
    setParams(next, { replace: true });
  };

  const query = useQuery({
    queryKey: ['alerts', projectId, status, severity, page],
    queryFn: () => alertsApi.list(projectId, { status: status || undefined, severity: severity || undefined, page, pageSize: 20 }),
    placeholderData: keepPreviousData,
  });

  return (
    <>
      <PageHeader
        title="Alerts"
        description="Anomalies grouped by client and pattern. Open one to inspect the evidence and record a decision."
        simulated={project?.isDemo}
      />
      <Card>
        <div className="flex flex-col gap-3 border-b border-line px-3 pt-2 sm:flex-row sm:items-end sm:justify-between">
          <div role="tablist" aria-label="Alert status" className="-mb-px flex overflow-x-auto">
            {TABS.map((t) => (
              <button
                key={t.label}
                role="tab"
                aria-selected={status === t.value}
                onClick={() => update('status', t.value)}
                className={cn(
                  'whitespace-nowrap border-b-2 px-3 py-2.5 text-[13px] font-medium transition-colors',
                  status === t.value ? 'border-cyan-600 text-ink' : 'border-transparent text-ink-3 hover:text-ink',
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
          <div className="pb-2.5">
            <Select aria-label="Severity" value={severity} onChange={(e) => update('severity', e.target.value)} className="h-8 w-40 text-xs">
              <option value="">All severities</option>
              <option value="critical">Critical</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
            </Select>
          </div>
        </div>

        {query.error ? (
          <ErrorState error={query.error} onRetry={() => void query.refetch()} />
        ) : query.isLoading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 5 }, (_, i) => (
              <Skeleton key={i} className="h-14" />
            ))}
          </div>
        ) : !query.data?.items.length ? (
          <EmptyState
            icon={<Bell size={20} aria-hidden />}
            title={status === 'active' ? 'No active alerts' : 'No alerts here'}
            description={
              status === 'active'
                ? 'When the model flags unusual traffic, related events are grouped into an alert and appear here.'
                : 'No alerts match this status and severity.'
            }
          />
        ) : (
          <ul className={cn('divide-y divide-line', query.isPlaceholderData && 'opacity-60')}>
            {query.data.items.map((a) => (
              <li key={a.id}>
                <Link to={`/app/alerts/${a.id}`} className="group flex items-center gap-4 px-5 py-3.5 hover:bg-surface">
                  <div className="w-20 shrink-0">
                    <SeverityBadge severity={a.severity} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate text-[13px] font-semibold text-ink">{a.title}</span>
                      {a.detectedBy.includes('guardrail') && !a.detectedBy.includes('model') && <Badge>Guardrail</Badge>}
                      {a.simulated && <Badge tone="violet">Simulated</Badge>}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-3">
                      <span className="font-mono">{a.clientId}</span>
                      {a.method && a.route && (
                        <span className="flex items-center gap-1.5">
                          <MethodBadge method={a.method} />
                          <span className="max-w-[220px] truncate font-mono">{a.route}</span>
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="hidden w-20 text-right sm:block">
                    <div className="text-[13px] font-medium tabular">{fmtNumber(a.eventCount)}</div>
                    <div className="text-2xs text-ink-3">events</div>
                  </div>
                  <div className="hidden w-20 text-right md:block">
                    <div className="font-mono text-[13px] tabular">{fmtScore(a.score)}</div>
                    <div className="text-2xs text-ink-3">max score</div>
                  </div>
                  <div className="hidden w-24 text-right md:block">
                    <div className="text-[13px] text-ink-2">{fmtRelative(a.lastSeenAt)}</div>
                    <div className="text-2xs text-ink-3">last seen</div>
                  </div>
                  <div className="w-28 text-right">
                    <AlertStatusBadge status={a.status} />
                  </div>
                  <ChevronRight size={16} className="text-ink-4 group-hover:text-ink-2" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        )}
        <Pagination meta={query.data?.meta} onPage={(p) => update('page', String(p))} />
      </Card>
    </>
  );
}

export default function AlertsPage() {
  return <RequireProject>{(id) => <Alerts key={id} projectId={id} />}</RequireProject>;
}
