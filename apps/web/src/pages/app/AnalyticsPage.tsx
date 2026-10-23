import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Beaker, Brain, FlaskConical, Play } from 'lucide-react';
import { useState } from 'react';
import { analyticsApi, mlApi } from '@/api/endpoints';
import type { EvaluationReport, MetricSet, RangeKey } from '@/api/types';
import { Legend, ScoreHistogram } from '@/components/charts/Charts';
import { CHART } from '@/components/charts/palette';
import { PageHeader } from '@/components/layout/PageHeader';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { InfoTip, Segmented } from '@/components/ui/Misc';
import { EmptyState, ErrorState, InlineError, Skeleton } from '@/components/ui/States';
import { useToast } from '@/components/ui/Toast';
import { cn } from '@/lib/cn';
import { fmtDateTime, fmtNumber, fmtPercent } from '@/lib/format';
import { useProject } from '@/lib/useProject';

const METRICS: { key: keyof MetricSet; label: string; info: string; lowerIsBetter?: boolean }[] = [
  { key: 'precision', label: 'Precision', info: 'Of the events flagged, the share that were injected incidents.' },
  { key: 'recall', label: 'Recall (events)', info: 'Of the incident events, the share flagged. Early events of an incident often look normal.' },
  { key: 'f1', label: 'F1', info: 'Harmonic mean of precision and recall.' },
  { key: 'false_positive_rate', label: 'False positive rate', info: 'Share of normal events flagged.', lowerIsBetter: true },
  { key: 'roc_auc', label: 'ROC AUC', info: 'Ranking quality of the raw score, independent of the threshold.' },
  { key: 'average_precision', label: 'Average precision', info: 'Area under the precision–recall curve of the raw score.' },
];

function EvaluationTable({ report }: { report: EvaluationReport }) {
  const cols = [
    { key: 'isolation_forest', label: 'Isolation Forest', set: report.isolation_forest as MetricSet },
    { key: 'hybrid_policy', label: 'IF + guardrail (live policy)', set: report.hybrid_policy as MetricSet },
    { key: 'baseline', label: 'Baseline: percentile rules', set: report.baseline as MetricSet },
  ];
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-left text-[13px]">
        <thead>
          <tr className="border-b border-line text-2xs uppercase tracking-wider text-ink-3">
            <th className="px-5 py-2.5 font-medium">Metric</th>
            {cols.map((c) => (
              <th key={c.key} className="px-4 py-2.5 text-right font-medium">
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {METRICS.map((m) => {
            const values = cols.map((c) => c.set[m.key] as number);
            const best = m.lowerIsBetter ? Math.min(...values) : Math.max(...values);
            return (
              <tr key={m.key}>
                <td className="px-5 py-2.5">
                  <span className="flex items-center gap-1.5 text-ink-2">
                    {m.label} <InfoTip content={m.info} />
                  </span>
                </td>
                {values.map((v, i) => (
                  <td key={i} className={cn('px-4 py-2.5 text-right font-mono tabular', v === best ? 'font-semibold text-ink' : 'text-ink-3')}>
                    {m.key === 'false_positive_rate' ? fmtPercent(v, 2) : v.toFixed(3)}
                  </td>
                ))}
              </tr>
            );
          })}
          <tr>
            <td className="px-5 py-2.5 text-ink-2">Incidents detected</td>
            {cols.map((c) => (
              <td key={c.key} className="px-4 py-2.5 text-right font-mono tabular">
                {c.set.incident_level.detected}/{c.set.incident_level.incidents}
              </td>
            ))}
          </tr>
          <tr>
            <td className="px-5 py-2.5 text-ink-2">Events flagged (TP / FP)</td>
            {cols.map((c) => (
              <td key={c.key} className="px-4 py-2.5 text-right font-mono text-xs tabular text-ink-3">
                {fmtNumber(c.set.confusion.tp)} / {fmtNumber(c.set.confusion.fp)}
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function ScenarioTable({ report }: { report: EvaluationReport }) {
  const scenarios = Object.entries(report.isolation_forest.per_scenario);
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px] text-left text-[13px]">
        <thead>
          <tr className="border-b border-line text-2xs uppercase tracking-wider text-ink-3">
            <th className="px-5 py-2.5 font-medium">Injected scenario</th>
            <th className="px-3 py-2.5 text-right font-medium">Events</th>
            <th className="px-3 py-2.5 text-right font-medium">IF recall</th>
            <th className="px-3 py-2.5 text-right font-medium">IF + guardrail</th>
            <th className="px-5 py-2.5 text-right font-medium">Baseline</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {scenarios.map(([key, s]) => (
            <tr key={key}>
              <td className="px-5 py-2.5 text-ink-2">{s.title}</td>
              <td className="px-3 py-2.5 text-right tabular">{fmtNumber(s.events)}</td>
              <td className="px-3 py-2.5 text-right font-mono tabular">{fmtPercent(s.recall, 0)}</td>
              <td className="px-3 py-2.5 text-right font-mono tabular">{fmtPercent(report.hybrid_policy.per_scenario[key]?.recall, 0)}</td>
              <td className="px-5 py-2.5 text-right font-mono tabular">{fmtPercent(report.baseline.per_scenario[key]?.recall, 0)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ProjectScores({ threshold }: { threshold?: number }) {
  const { project } = useProject();
  const [range, setRange] = useState<RangeKey>('24h');
  const query = useQuery({
    queryKey: ['scores', project?.id, range],
    queryFn: () => analyticsApi.scores(project!.id, range),
    enabled: !!project,
  });
  if (!project) return null;
  const total = query.data?.reduce((s, b) => s + b.count, 0) ?? 0;
  return (
    <Card>
      <CardHeader
        title="Score distribution in this project"
        description={`Stored anomaly scores for ${project.name}${project.isDemo ? ' (simulated)' : ''}.`}
        action={
          <Segmented
            label="Range"
            value={range}
            onChange={setRange}
            options={[
              { value: '1h', label: '1h' },
              { value: '24h', label: '24h' },
              { value: '7d', label: '7d' },
            ]}
          />
        }
      />
      <div className="px-3 py-4">
        {query.isLoading ? (
          <Skeleton className="mx-2 h-56" />
        ) : query.error ? (
          <ErrorState error={query.error} />
        ) : total === 0 ? (
          <p className="py-12 text-center text-sm text-ink-3">No scored events in this range.</p>
        ) : (
          <>
            <ScoreHistogram buckets={query.data!} threshold={threshold} />
            <div className="mt-2 px-2">
              <Legend items={[{ label: 'Not flagged', color: CHART.requests }, { label: 'Flagged', color: CHART.anomalies }]} />
            </div>
          </>
        )}
      </div>
    </Card>
  );
}

export default function AnalyticsPage() {
  const qc = useQueryClient();
  const notify = useToast();
  const model = useQuery({ queryKey: ['ml-model'], queryFn: mlApi.model, retry: false });
  const evaluation = useQuery({ queryKey: ['ml-evaluation'], queryFn: mlApi.evaluation, retry: false });
  const run = useMutation({
    mutationFn: mlApi.runEvaluation,
    onSuccess: (report) => {
      qc.setQueryData(['ml-evaluation'], report);
      notify('Evaluation finished.');
    },
  });
  const info = model.data?.model;
  const report = evaluation.data;

  return (
    <>
      <PageHeader
        title="Model & analytics"
        description="The trained model, how it was evaluated, and how its scores are distributed in your traffic."
        actions={
          <Button onClick={() => run.mutate()} loading={run.isPending} icon={<Play size={14} aria-hidden />} variant={report ? 'secondary' : 'primary'}>
            {run.isPending ? 'Evaluating…' : report ? 'Re-run evaluation' : 'Run evaluation'}
          </Button>
        }
      />
      {run.error != null && (
        <div className="mb-4">
          <InlineError error={run.error} />
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader
            title={
              <span className="flex items-center gap-2">
                <Brain size={15} className="text-violet-600" aria-hidden /> Deployed model
              </span>
            }
          />
          {model.isLoading ? (
            <div className="space-y-2 p-5">
              <Skeleton className="h-5" />
              <Skeleton className="h-5" />
              <Skeleton className="h-5" />
            </div>
          ) : model.error ? (
            <ErrorState error={model.error} onRetry={() => void model.refetch()} />
          ) : info ? (
            <div className="px-5 py-4">
              <dl className="space-y-2 text-[13px]">
                {[
                  ['Algorithm', `${info.algorithm} (scikit-learn ${info.sklearn_version})`],
                  ['Version', <span className="font-mono text-xs">{info.version}</span>],
                  ['Trained', fmtDateTime(info.trained_at)],
                  ['Training data', `${fmtNumber(info.training.rows)} synthetic events, seed ${info.training.seed}`],
                  ['Trees / sample size', `${info.hyperparameters.n_estimators} / ${info.hyperparameters.max_samples}`],
                  ['Alert threshold', <span className="font-mono">{info.threshold.toFixed(4)}</span>],
                  ['Threshold rule', `${(info.alert_quantile * 100).toFixed(1)}th percentile of training scores`],
                  ['Severity bands', `high ≥ ${info.severity_thresholds.high.toFixed(3)}, critical ≥ ${info.severity_thresholds.critical.toFixed(3)}`],
                ].map(([k, v]) => (
                  <div key={String(k)} className="flex justify-between gap-3">
                    <dt className="text-ink-3">{k}</dt>
                    <dd className="text-right font-medium text-ink">{v}</dd>
                  </div>
                ))}
              </dl>
              <p className="mt-4 rounded-md bg-surface px-3 py-2.5 text-xs leading-relaxed text-ink-2">{info.score_interpretation}</p>
              <p className="mt-3 text-xs leading-relaxed text-ink-3">
                <strong className="font-medium text-ink-2">Guardrail:</strong> {info.guardrail.description} Factor {info.guardrail.factor}×.
              </p>
              <div className="mt-4">
                <p className="label-caps mb-2">{info.features.length} features</p>
                <div className="flex flex-wrap gap-1.5">
                  {[...new Set(info.features.map((f) => f.label))].map((l) => (
                    <Badge key={l}>{l}</Badge>
                  ))}
                </div>
              </div>
            </div>
          ) : null}
        </Card>

        <div className="space-y-5 lg:col-span-2">
          <Card>
            <CardHeader
              title={
                <span className="flex items-center gap-2">
                  <FlaskConical size={15} className="text-ink-3" aria-hidden /> Evaluation on held-out synthetic data
                </span>
              }
              description={
                report
                  ? `Run ${fmtDateTime(report.evaluated_at)} · ${fmtNumber(report.dataset.events)} events (${fmtPercent(report.dataset.anomaly_rate)} injected), seed ${report.dataset.seed}. Overlap with training data: ${report.dataset.overlap_with_training}.`
                  : 'Metrics appear only after the evaluation script has actually run against the current model.'
              }
            />
            {evaluation.isLoading ? (
              <Skeleton className="m-5 h-48" />
            ) : evaluation.error ? (
              <ErrorState error={evaluation.error} onRetry={() => void evaluation.refetch()} />
            ) : !report ? (
              <EmptyState
                icon={<Beaker size={20} aria-hidden />}
                title="No evaluation for this model yet"
                description="Run the evaluation to score a separate labelled dataset and compare against a rule-based baseline. It takes a few seconds."
                action={
                  <Button onClick={() => run.mutate()} loading={run.isPending} icon={<Play size={14} aria-hidden />}>
                    Run evaluation
                  </Button>
                }
              />
            ) : (
              <>
                <EvaluationTable report={report} />
                <div className="border-t border-line">
                  <ScenarioTable report={report} />
                </div>
                <ul className="space-y-1 border-t border-line px-5 py-4 text-xs text-ink-3">
                  {report.notes.map((n) => (
                    <li key={n}>• {n}</li>
                  ))}
                  <li>• The baseline uses the same alert budget: each rule threshold is the {(report.alert_quantile * 100).toFixed(1)}th percentile of training values.</li>
                </ul>
              </>
            )}
          </Card>
          <ProjectScores threshold={info?.threshold} />
        </div>
      </div>
    </>
  );
}
