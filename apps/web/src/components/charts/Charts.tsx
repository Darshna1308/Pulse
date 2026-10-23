import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { Overview, ScoreBucket } from '@/api/types';
import { fmtNumber } from '@/lib/format';
import { CHART } from './palette';

const axisProps = { stroke: CHART.axis, fontSize: 11, tickLine: false, axisLine: false } as const;

function bucketLabel(iso: string, bucketMs: number) {
  const d = new Date(iso);
  if (bucketMs >= 86_400_000) return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  if (bucketMs >= 6 * 3_600_000) return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit' });
  return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

function TooltipBox({ title, rows }: { title: string; rows: { label: string; value: string; color: string }[] }) {
  return (
    <div className="rounded-md border border-line bg-white px-3 py-2 text-xs shadow-pop">
      <div className="mb-1 font-medium text-ink">{title}</div>
      {rows.map((r) => (
        <div key={r.label} className="flex items-center gap-2 text-ink-2">
          <span className="h-2 w-2 rounded-sm" style={{ background: r.color }} aria-hidden />
          <span className="flex-1">{r.label}</span>
          <span className="font-medium tabular text-ink">{r.value}</span>
        </div>
      ))}
    </div>
  );
}

/** Requests and errors share one axis (both are request counts). */
export function TrafficChart({ data }: { data: Overview }) {
  const rows = data.series.map((s) => ({ ...s, ok: s.requests - s.errors }));
  return (
    <div className="h-64" role="img" aria-label="Requests over time, split into successful and error responses">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={rows} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
          <defs>
            <linearGradient id="reqFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor={CHART.requests} stopOpacity={0.22} />
              <stop offset="1" stopColor={CHART.requests} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke={CHART.grid} vertical={false} />
          <XAxis dataKey="bucket" tickFormatter={(v) => bucketLabel(v, data.bucketMs)} minTickGap={36} {...axisProps} />
          <YAxis allowDecimals={false} tickFormatter={(v) => fmtNumber(v)} width={48} {...axisProps} />
          <Tooltip
            cursor={{ stroke: CHART.axis, strokeDasharray: '3 3' }}
            content={({ active, payload, label }) =>
              active && payload?.length ? (
                <TooltipBox
                  title={bucketLabel(String(label), data.bucketMs)}
                  rows={[
                    { label: 'Requests', value: fmtNumber(payload[0]!.payload.requests), color: CHART.requests },
                    { label: 'Errors (4xx/5xx)', value: fmtNumber(payload[0]!.payload.errors), color: CHART.errors },
                  ]}
                />
              ) : null
            }
          />
          <Area type="monotone" dataKey="requests" stroke={CHART.requests} strokeWidth={2} fill="url(#reqFill)" isAnimationActive={false} />
          <Area type="monotone" dataKey="errors" stroke={CHART.errors} strokeWidth={2} fill="transparent" isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function AnomalyBars({ data }: { data: Overview }) {
  return (
    <div className="h-28" role="img" aria-label="Anomalous events per time bucket">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data.series} margin={{ top: 4, right: 8, left: -12, bottom: 0 }} barCategoryGap={2}>
          <CartesianGrid stroke={CHART.grid} vertical={false} />
          <XAxis dataKey="bucket" hide />
          <YAxis allowDecimals={false} width={48} {...axisProps} />
          <Tooltip
            cursor={{ fill: 'rgba(99,67,232,0.06)' }}
            content={({ active, payload, label }) =>
              active && payload?.length ? (
                <TooltipBox
                  title={bucketLabel(String(label), data.bucketMs)}
                  rows={[{ label: 'Anomalous events', value: fmtNumber(payload[0]!.payload.anomalies), color: CHART.anomalies }]}
                />
              ) : null
            }
          />
          <Bar dataKey="anomalies" fill={CHART.anomalies} radius={[3, 3, 0, 0]} isAnimationActive={false} maxBarSize={18} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function StatusBars({ data }: { data: Overview }) {
  const total = data.statusDistribution.reduce((s, d) => s + d.count, 0) || 1;
  return (
    <ul className="space-y-3">
      {data.statusDistribution.map((s) => (
        <li key={s.statusClass}>
          <div className="mb-1 flex items-baseline justify-between text-xs">
            <span className="font-mono font-medium text-ink-2">{s.statusClass}</span>
            <span className="tabular text-ink-3">
              <span className="font-medium text-ink">{fmtNumber(s.count)}</span> · {((s.count / total) * 100).toFixed(1)}%
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-surface-sunken">
            <div className="h-full rounded-full" style={{ width: `${(s.count / total) * 100}%`, background: CHART.status[s.statusClass] }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

export function ScoreHistogram({ buckets, threshold }: { buckets: ScoreBucket[]; threshold?: number }) {
  const rows = buckets.map((b) => ({ ...b, label: `${b.from.toFixed(2)}–${b.to.toFixed(2)}`, normal: b.count - b.anomalies }));
  return (
    <div className="h-56" role="img" aria-label="Distribution of anomaly scores; flagged events highlighted">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} margin={{ top: 8, right: 8, left: -12, bottom: 0 }} barCategoryGap={2}>
          <CartesianGrid stroke={CHART.grid} vertical={false} />
          <XAxis dataKey="label" interval={0} angle={-30} textAnchor="end" height={44} {...axisProps} fontSize={10} />
          <YAxis allowDecimals={false} tickFormatter={(v) => fmtNumber(v)} width={48} {...axisProps} />
          <Tooltip
            cursor={{ fill: 'rgba(13,21,38,0.04)' }}
            content={({ active, payload }) =>
              active && payload?.length ? (
                <TooltipBox
                  title={`Score ${payload[0]!.payload.label}`}
                  rows={[
                    { label: 'Not flagged', value: fmtNumber(payload[0]!.payload.normal), color: CHART.requests },
                    { label: 'Flagged', value: fmtNumber(payload[0]!.payload.anomalies), color: CHART.anomalies },
                  ]}
                />
              ) : null
            }
          />
          <Bar dataKey="normal" stackId="s" fill={CHART.requests} isAnimationActive={false}>
            {rows.map((r) => (
              <Cell key={r.label} fillOpacity={threshold != null && r.from >= threshold ? 0.5 : 1} />
            ))}
          </Bar>
          <Bar dataKey="anomalies" stackId="s" fill={CHART.anomalies} radius={[3, 3, 0, 0]} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function Legend({ items }: { items: { label: string; color: string }[] }) {
  return (
    <div className="flex flex-wrap items-center gap-4 text-xs text-ink-3">
      {items.map((i) => (
        <span key={i.label} className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-sm" style={{ background: i.color }} aria-hidden />
          {i.label}
        </span>
      ))}
    </div>
  );
}
