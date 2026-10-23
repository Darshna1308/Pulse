import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { motion, useReducedMotion } from 'framer-motion';
import { ArrowLeft, Brain, CheckCircle2, Eye, FileSearch, RotateCcw, ShieldAlert, XCircle } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ApiError } from '@/api/client';
import { alertsApi } from '@/api/endpoints';
import type { AlertStatus, ApiEvent } from '@/api/types';
import { EventDetailModal } from '@/components/EventDetail';
import { PageHeader } from '@/components/layout/PageHeader';
import { RequireProject } from '@/components/NoProject';
import { AlertStatusBadge, Badge, MethodBadge, SeverityBadge, StatusCode } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { Field, Textarea } from '@/components/ui/Field';
import { InfoTip } from '@/components/ui/Misc';
import { Modal } from '@/components/ui/Modal';
import { EmptyState, ErrorState, InlineError, Skeleton } from '@/components/ui/States';
import { useToast } from '@/components/ui/Toast';
import { fmtDateTime, fmtEvidenceValue, fmtMs, fmtNumber, fmtRelative, fmtScore, plural } from '@/lib/format';

const ACTIONS: Record<AlertStatus, { to: AlertStatus; label: string; icon: typeof Eye; variant: 'primary' | 'secondary' | 'danger' }[]> = {
  open: [
    { to: 'investigating', label: 'Start investigating', icon: Eye, variant: 'primary' },
    { to: 'resolved', label: 'Resolve', icon: CheckCircle2, variant: 'secondary' },
    { to: 'dismissed', label: 'Dismiss', icon: XCircle, variant: 'secondary' },
  ],
  investigating: [
    { to: 'resolved', label: 'Resolve', icon: CheckCircle2, variant: 'primary' },
    { to: 'dismissed', label: 'Dismiss', icon: XCircle, variant: 'secondary' },
    { to: 'open', label: 'Back to open', icon: RotateCcw, variant: 'secondary' },
  ],
  resolved: [{ to: 'open', label: 'Reopen', icon: RotateCcw, variant: 'secondary' }],
  dismissed: [{ to: 'open', label: 'Reopen', icon: RotateCcw, variant: 'secondary' }],
};

const NOTE_REQUIRED: AlertStatus[] = ['resolved', 'dismissed'];

function StatusDialog({ target, onClose, onConfirm, pending, error }: { target: AlertStatus | null; onClose: () => void; onConfirm: (note: string) => void; pending: boolean; error: unknown }) {
  const [note, setNote] = useState('');
  const required = target ? NOTE_REQUIRED.includes(target) : false;
  const [touched, setTouched] = useState(false);
  const invalid = required && !note.trim();
  const titles: Record<AlertStatus, string> = {
    investigating: 'Start investigating',
    resolved: 'Resolve alert',
    dismissed: 'Dismiss alert',
    open: 'Reopen alert',
  };
  return (
    <Modal
      open={!!target}
      onClose={onClose}
      title={target ? titles[target] : ''}
      description={
        target === 'dismissed'
          ? 'Dismiss when the activity is expected (for example, a load test or a known integration).'
          : target === 'resolved'
            ? 'Describe what was found and what was done. This note is stored with the alert history.'
            : 'Optionally leave a note for the alert history.'
      }
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            loading={pending}
            onClick={() => {
              setTouched(true);
              if (!invalid) onConfirm(note.trim());
            }}
          >
            Confirm
          </Button>
        </>
      }
    >
      <Field label={required ? 'Note (required)' : 'Note (optional)'} error={touched && invalid ? 'Add a short note explaining the decision.' : undefined}>
        {(p) => <Textarea {...p} value={note} maxLength={1000} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Client was a misconfigured retry loop; rate limit applied." />}
      </Field>
      <div className="mt-3">
        <InlineError error={error} />
      </div>
    </Modal>
  );
}

function AlertDetail({ projectId }: { projectId: string }) {
  const { alertId = '' } = useParams();
  const qc = useQueryClient();
  const notify = useToast();
  const reduce = useReducedMotion();
  const [target, setTarget] = useState<AlertStatus | null>(null);
  const [selected, setSelected] = useState<ApiEvent | null>(null);
  const query = useQuery({ queryKey: ['alert', projectId, alertId], queryFn: () => alertsApi.get(projectId, alertId) });

  const mutation = useMutation({
    mutationFn: ({ status, note }: { status: AlertStatus; note: string }) => alertsApi.update(projectId, alertId, { status, note: note || undefined }),
    onSuccess: (alert) => {
      qc.setQueryData(['alert', projectId, alertId], (old: typeof query.data) => (old ? { ...old, alert } : old));
      void qc.invalidateQueries({ queryKey: ['alerts', projectId] });
      void qc.invalidateQueries({ queryKey: ['overview', projectId] });
      setTarget(null);
      notify(`Alert marked ${alert.status}.`);
    },
  });

  if (query.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-80" />
        <div className="grid gap-5 lg:grid-cols-3">
          <Skeleton className="h-72 lg:col-span-2" />
          <Skeleton className="h-72" />
        </div>
      </div>
    );
  }
  if (query.error) {
    const missing = query.error instanceof ApiError && query.error.status === 404;
    return (
      <Card>
        {missing ? (
          <EmptyState
            icon={<FileSearch size={20} aria-hidden />}
            title="Alert not found"
            description="It may belong to a different project, or it was deleted with its project."
            action={
              <Link to="/app/alerts">
                <Button variant="secondary">Back to alerts</Button>
              </Link>
            }
          />
        ) : (
          <ErrorState error={query.error} onRetry={() => void query.refetch()} />
        )}
      </Card>
    );
  }

  const { alert, events } = query.data!;
  const maxContribution = Math.max(...alert.attributions.map((a) => a.contribution), 0.0001);

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: 'Alerts', to: '/app/alerts' }, { label: alert.title }]}
        title={alert.title}
        simulated={alert.simulated}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <SeverityBadge severity={alert.severity} />
            <AlertStatusBadge status={alert.status} />
            <span>
              {plural(alert.eventCount, 'event')} from <span className="font-mono text-ink-2">{alert.clientId}</span> · last seen {fmtRelative(alert.lastSeenAt)}
            </span>
          </span>
        }
        actions={ACTIONS[alert.status as AlertStatus].map((a) => (
          <Button key={a.to} variant={a.variant} icon={<a.icon size={15} aria-hidden />} onClick={() => (mutation.reset(), setTarget(a.to))}>
            {a.label}
          </Button>
        ))}
      />

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Card>
            <CardHeader
              title={
                <span className="flex items-center gap-2">
                  <ShieldAlert size={15} className="text-ink-3" aria-hidden />
                  Observed evidence
                </span>
              }
              description="Facts computed directly from the most anomalous event, compared with the model’s training baseline."
            />
            {alert.evidence.length ? (
              <ul className="divide-y divide-line">
                {alert.evidence.map((e, i) => {
                  const pct = e.baseline_p99 && e.value != null ? Math.min(100, (e.baseline_p99 / e.value) * 100) : null;
                  return (
                    <motion.li
                      key={e.metric + i}
                      className="px-5 py-3.5"
                      initial={reduce ? false : { opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.04 }}
                    >
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <span className="text-[13px] font-medium text-ink">{e.label}</span>
                        <span className="font-mono text-[13px] font-semibold tabular text-ink">{fmtEvidenceValue(e.value, e.unit)}</span>
                      </div>
                      <p className="mt-0.5 text-xs text-ink-3">{e.summary}</p>
                      {pct != null && (
                        <div className="mt-2 flex items-center gap-3 text-2xs text-ink-3">
                          <div className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-violet-200/60" aria-hidden>
                            <div className="absolute inset-y-0 left-0 rounded-full bg-ink-4" style={{ width: `${pct}%` }} />
                          </div>
                          <span className="whitespace-nowrap">
                            baseline p99 {fmtEvidenceValue(e.baseline_p99, e.unit)} · median {fmtEvidenceValue(e.baseline_median, e.unit)}
                          </span>
                        </div>
                      )}
                    </motion.li>
                  );
                })}
              </ul>
            ) : (
              <p className="px-5 py-6 text-sm text-ink-3">
                No single metric exceeded its baseline p99. The model flagged an unusual <em>combination</em> of otherwise ordinary values; see the
                model signal for which features drove the score.
              </p>
            )}
          </Card>

          <Card>
            <CardHeader title="Related events" description={`${Math.min(events.length, 50)} of ${fmtNumber(alert.eventCount)} grouped ${alert.eventCount === 1 ? 'event' : 'events'}, oldest first. Click one for its context.`} />
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-[13px]">
                <thead>
                  <tr className="border-b border-line text-2xs uppercase tracking-wider text-ink-3">
                    <th className="px-5 py-2 font-medium">Time</th>
                    <th className="px-3 py-2 font-medium">Endpoint</th>
                    <th className="px-3 py-2 font-medium">Status</th>
                    <th className="px-3 py-2 text-right font-medium">Latency</th>
                    <th className="px-3 py-2 text-right font-medium">Req/min</th>
                    <th className="px-5 py-2 text-right font-medium">Score</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {events.map((e) => (
                    <tr key={e.id} tabIndex={0} onClick={() => setSelected(e)} onKeyDown={(k) => k.key === 'Enter' && setSelected(e)} className="cursor-pointer hover:bg-surface">
                      <td className="whitespace-nowrap px-5 py-2 tabular text-ink-2">{fmtDateTime(e.timestamp)}</td>
                      <td className="max-w-[240px] px-3 py-2">
                        <span className="flex items-center gap-2">
                          <MethodBadge method={e.method} />
                          <span className="truncate font-mono text-xs">{e.route}</span>
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        <StatusCode code={e.statusCode} />
                      </td>
                      <td className="px-3 py-2 text-right tabular">{fmtMs(e.latencyMs)}</td>
                      <td className="px-3 py-2 text-right tabular">{fmtNumber(e.context?.clientRequests1m ?? null)}</td>
                      <td className="px-5 py-2 text-right font-mono text-xs tabular">{fmtScore(e.prediction?.score)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader
              title={
                <span className="flex items-center gap-2">
                  <Brain size={15} className="text-violet-600" aria-hidden />
                  Model signal
                </span>
              }
              description="What the Isolation Forest reported. A ranking of unusualness, not proof of intent."
            />
            <div className="space-y-4 px-5 py-4">
              <div className="flex items-end justify-between">
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="label-caps">Anomaly score</span>
                    <InfoTip content="−IsolationForest.score_samples. Around 0.45 is typical; higher means the event was isolated with fewer random splits. It is not a probability." />
                  </div>
                  <div className="mt-1 font-display text-3xl font-semibold tabular text-violet-700">{fmtScore(alert.score)}</div>
                </div>
                <div className="text-right text-xs text-ink-3">
                  <div>
                    threshold <span className="font-mono text-ink">{fmtScore(alert.threshold)}</span>
                  </div>
                  <div>
                    percentile <span className="font-mono text-ink">{alert.percentile?.toFixed(2) ?? '—'}</span>
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {alert.detectedBy.map((d) => (
                  <Badge key={d} tone={d === 'model' ? 'violet' : 'neutral'}>
                    {d === 'model' ? 'Isolation Forest above threshold' : 'Magnitude guardrail (>10× training p99)'}
                  </Badge>
                ))}
              </div>
              <div>
                <p className="label-caps mb-2">Feature sensitivity</p>
                {alert.attributions.length ? (
                  <ul className="space-y-2.5">
                    {alert.attributions.map((a) => (
                      <li key={a.feature}>
                        <div className="mb-1 flex justify-between text-xs">
                          <span className="text-ink-2">{a.label}</span>
                          <span className="font-mono tabular text-ink-3">+{a.contribution.toFixed(3)}</span>
                        </div>
                        <div className="h-1.5 rounded-full bg-surface-sunken" aria-hidden>
                          <div className="h-full rounded-full bg-violet-500" style={{ width: `${(a.contribution / maxContribution) * 100}%` }} />
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-xs text-ink-3">No single feature moved the score noticeably.</p>
                )}
                <p className="mt-3 text-2xs leading-relaxed text-ink-3">
                  Sensitivity is the drop in score when one feature is reset to its training median, holding the others fixed.
                </p>
              </div>
            </div>
          </Card>

          <Card>
            <CardHeader title="Details" />
            <dl className="divide-y divide-line text-[13px]">
              {[
                ['Client', <span className="font-mono text-xs">{alert.clientId}</span>],
                [
                  'Endpoint',
                  alert.method ? (
                    <span className="flex items-center justify-end gap-1.5">
                      <MethodBadge method={alert.method} />
                      <span className="max-w-[150px] truncate font-mono text-xs">{alert.route}</span>
                    </span>
                  ) : (
                    '—'
                  ),
                ],
                ['First seen', fmtDateTime(alert.firstSeenAt)],
                ['Last seen', fmtDateTime(alert.lastSeenAt)],
                ['Pattern', <span className="font-mono text-xs">{alert.patternCode}</span>],
                ['Model', <span className="font-mono text-xs">{alert.modelVersion ?? '—'}</span>],
              ].map(([k, v]) => (
                <div key={String(k)} className="flex items-center justify-between gap-3 px-5 py-2.5">
                  <dt className="text-ink-3">{k}</dt>
                  <dd className="text-right font-medium text-ink">{v}</dd>
                </div>
              ))}
            </dl>
          </Card>

          <Card>
            <CardHeader title="History" />
            <ol className="relative space-y-4 px-5 py-4">
              {[...alert.statusHistory].reverse().map((h, i) => (
                <li key={i} className="relative pl-5">
                  <span className="absolute left-0 top-1.5 h-2 w-2 rounded-full bg-cyan-600 ring-4 ring-cyan-200/50" aria-hidden />
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <AlertStatusBadge status={h.to as AlertStatus} />
                    <span className="text-ink-3">{fmtDateTime(h.at)}</span>
                  </div>
                  {h.note && <p className="mt-1 text-[13px] text-ink-2">{h.note}</p>}
                </li>
              ))}
            </ol>
          </Card>
        </div>
      </div>

      <StatusDialog
        key={target ?? 'none'}
        target={target}
        onClose={() => setTarget(null)}
        pending={mutation.isPending}
        error={mutation.error}
        onConfirm={(note) => target && mutation.mutate({ status: target, note })}
      />
      <EventDetailModal projectId={projectId} event={selected} onClose={() => setSelected(null)} />
      <div className="mt-6">
        <Link to="/app/alerts" className="inline-flex items-center gap-1.5 text-xs font-medium text-ink-3 hover:text-ink">
          <ArrowLeft size={13} aria-hidden /> All alerts
        </Link>
      </div>
    </>
  );
}

export default function AlertDetailPage() {
  return <RequireProject>{(id) => <AlertDetail key={id} projectId={id} />}</RequireProject>;
}
