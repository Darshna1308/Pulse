import { useQuery } from '@tanstack/react-query';
import { ExternalLink } from 'lucide-react';
import { Link } from 'react-router-dom';
import { eventsApi } from '@/api/endpoints';
import type { ApiEvent } from '@/api/types';
import { fmtBytes, fmtDateTime, fmtMs, fmtNumber, fmtPercent, fmtScore } from '@/lib/format';
import { AlertStatusBadge, Badge, MethodBadge, SeverityBadge, StatusCode } from './ui/Badge';
import { Modal } from './ui/Modal';
import { Skeleton } from './ui/States';

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5 text-[13px]">
      <dt className="text-ink-3">{label}</dt>
      <dd className="text-right font-medium tabular text-ink">{children}</dd>
    </div>
  );
}

export function EventDetailModal({ projectId, event, onClose }: { projectId: string; event: ApiEvent | null; onClose: () => void }) {
  const detail = useQuery({
    queryKey: ['event', projectId, event?.id],
    queryFn: () => eventsApi.get(projectId, event!.id),
    enabled: !!event,
  });
  const e = detail.data?.event ?? event;
  const c = e?.context;
  return (
    <Modal open={!!event} onClose={onClose} title="Event detail" description={e ? fmtDateTime(e.timestamp) : undefined}>
      {e && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2 rounded-md bg-surface px-3 py-2">
            <MethodBadge method={e.method} />
            <span className="min-w-0 flex-1 truncate font-mono text-xs">{e.route}</span>
            <StatusCode code={e.statusCode} />
          </div>
          <div className="grid gap-5 sm:grid-cols-2">
            <dl>
              <p className="label-caps mb-1">Request</p>
              <Row label="Client">
                <span className="font-mono text-xs">{e.clientId}</span>
              </Row>
              <Row label="Latency">{fmtMs(e.latencyMs)}</Row>
              <Row label="Request size">{fmtBytes(e.requestBytes)}</Row>
              <Row label="Response size">{fmtBytes(e.responseBytes)}</Row>
              {e.externalId && (
                <Row label="Event id">
                  <span className="font-mono text-xs">{e.externalId}</span>
                </Row>
              )}
              {e.simulatedScenario && (
                <Row label="Simulation">
                  <Badge tone="violet">injected: {e.simulatedScenario.replace(/_/g, ' ')}</Badge>
                </Row>
              )}
            </dl>
            <dl>
              <p className="label-caps mb-1">Context at ingestion</p>
              {c ? (
                <>
                  <Row label="Client req / 1 min">{fmtNumber(c.clientRequests1m)}</Row>
                  <Row label="Client req / 5 min">{fmtNumber(c.clientRequests5m)}</Row>
                  <Row label="Client error rate (5m)">{fmtPercent((c.clientErrors5m ?? 0) / (c.clientRequests5m || 1))}</Row>
                  <Row label="Distinct endpoints (5m)">{fmtNumber(c.clientDistinctRoutes5m)}</Row>
                  <Row label="Route median latency">{fmtMs(c.routeLatencyBaselineMs)}</Row>
                </>
              ) : (
                <p className="py-2 text-xs text-ink-3">Not computed yet.</p>
              )}
            </dl>
          </div>
          <div className="rounded-md border border-line p-3">
            <p className="label-caps mb-2">Model signal</p>
            {e.processing.status === 'failed' ? (
              <p className="text-[13px] text-warn">Scoring failed ({e.processing.error ?? 'unknown'}). Retry from the overview page.</p>
            ) : e.prediction ? (
              <dl className="grid grid-cols-2 gap-x-6 sm:grid-cols-4">
                <Row label="Score">{fmtScore(e.prediction.score)}</Row>
                <Row label="Threshold">{fmtScore(e.prediction.threshold)}</Row>
                <Row label="Percentile">{e.prediction.percentile.toFixed(1)}</Row>
                <Row label="Flagged">{e.prediction.isAnomaly ? (e.prediction.severity ? <SeverityBadge severity={e.prediction.severity} /> : 'yes') : 'no'}</Row>
              </dl>
            ) : (
              <p className="text-[13px] text-ink-3">Pending.</p>
            )}
          </div>
          {detail.isLoading && <Skeleton className="h-9" />}
          {detail.data?.alert && (
            <Link to={`/app/alerts/${detail.data.alert.id}`} className="flex items-center justify-between rounded-md border border-violet-300/50 bg-violet-200/20 px-3 py-2.5 text-[13px] hover:bg-violet-200/40">
              <span className="flex items-center gap-2">
                <AlertStatusBadge status={detail.data.alert.status} />
                <span className="font-medium">{detail.data.alert.title}</span>
              </span>
              <ExternalLink size={14} className="text-ink-3" aria-hidden />
            </Link>
          )}
        </div>
      )}
    </Modal>
  );
}
