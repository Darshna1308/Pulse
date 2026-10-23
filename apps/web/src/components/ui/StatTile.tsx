import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { InfoTip } from './Misc';
import { Skeleton } from './States';

export function StatTile({
  label,
  value,
  sub,
  info,
  loading,
  emphasis,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  info?: ReactNode;
  loading?: boolean;
  emphasis?: 'violet' | 'critical';
}) {
  return (
    <div className="card px-4 py-4">
      <div className="flex items-center gap-1.5">
        <span className="label-caps">{label}</span>
        {info && <InfoTip content={info} label={`About ${label}`} />}
      </div>
      {loading ? (
        <Skeleton className="mt-3 h-7 w-24" />
      ) : (
        <div
          className={cn(
            'mt-2 font-display text-[1.65rem] font-semibold leading-none tracking-[-0.02em] tabular',
            emphasis === 'violet' ? 'text-violet-700' : emphasis === 'critical' ? 'text-critical' : 'text-ink',
          )}
        >
          {value}
        </div>
      )}
      <div className="mt-2 min-h-[1rem] text-xs text-ink-3">{loading ? <Skeleton className="h-3 w-32" /> : sub}</div>
    </div>
  );
}
