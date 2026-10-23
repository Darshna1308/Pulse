import type { ReactNode } from 'react';
import { AlertOctagon, AlertTriangle, CircleDot, CheckCircle2, Eye, XCircle } from 'lucide-react';
import type { AlertStatus, Severity } from '@/api/types';
import { cn } from '@/lib/cn';

type Tone = 'neutral' | 'info' | 'violet' | 'ok' | 'warn' | 'serious' | 'critical';

const tones: Record<Tone, string> = {
  neutral: 'bg-surface-sunken text-ink-2 ring-line-strong',
  info: 'bg-cyan-200/40 text-cyan-800 ring-cyan-600/20',
  violet: 'bg-violet-200/40 text-violet-700 ring-violet-600/20',
  ok: 'bg-ok-soft text-ok ring-ok/20',
  warn: 'bg-warn-soft text-warn ring-warn/25',
  serious: 'bg-serious-soft text-serious ring-serious/20',
  critical: 'bg-critical-soft text-critical ring-critical/20',
};

export function Badge({ tone = 'neutral', children, icon, className }: { tone?: Tone; children: ReactNode; icon?: ReactNode; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-2xs font-medium ring-1 ring-inset', tones[tone], className)}>
      {icon}
      {children}
    </span>
  );
}

const severityMeta: Record<Severity, { tone: Tone; label: string; Icon: typeof AlertTriangle }> = {
  medium: { tone: 'warn', label: 'Medium', Icon: AlertTriangle },
  high: { tone: 'serious', label: 'High', Icon: AlertTriangle },
  critical: { tone: 'critical', label: 'Critical', Icon: AlertOctagon },
};

export function SeverityBadge({ severity }: { severity: Severity }) {
  const { tone, label, Icon } = severityMeta[severity];
  return (
    <Badge tone={tone} icon={<Icon size={12} aria-hidden />}>
      {label}
    </Badge>
  );
}

const statusMeta: Record<AlertStatus, { tone: Tone; label: string; Icon: typeof CircleDot }> = {
  open: { tone: 'info', label: 'Open', Icon: CircleDot },
  investigating: { tone: 'violet', label: 'Investigating', Icon: Eye },
  resolved: { tone: 'ok', label: 'Resolved', Icon: CheckCircle2 },
  dismissed: { tone: 'neutral', label: 'Dismissed', Icon: XCircle },
};

export function AlertStatusBadge({ status }: { status: AlertStatus }) {
  const { tone, label, Icon } = statusMeta[status];
  return (
    <Badge tone={tone} icon={<Icon size={12} aria-hidden />}>
      {label}
    </Badge>
  );
}

export function MethodBadge({ method }: { method: string }) {
  const color: Record<string, string> = {
    GET: 'text-cyan-800 bg-cyan-200/40',
    POST: 'text-violet-700 bg-violet-200/40',
    PUT: 'text-warn bg-warn-soft',
    PATCH: 'text-warn bg-warn-soft',
    DELETE: 'text-critical bg-critical-soft',
  };
  return (
    <span className={cn('inline-block w-[3.25rem] rounded px-1 py-0.5 text-center font-mono text-[10px] font-semibold', color[method] ?? 'bg-surface-sunken text-ink-2')}>
      {method}
    </span>
  );
}

export function StatusCode({ code }: { code: number }) {
  const cls = code >= 500 ? 'text-critical' : code >= 400 ? 'text-warn' : code >= 300 ? 'text-ink-2' : 'text-ok';
  return <span className={cn('font-mono text-xs font-medium tabular', cls)}>{code}</span>;
}

export function SimulatedBadge() {
  return (
    <Badge tone="violet" className="font-semibold">
      Simulated data
    </Badge>
  );
}
