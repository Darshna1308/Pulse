import type { ReactNode } from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';
import { ApiError } from '@/api/client';
import { cn } from '@/lib/cn';
import { Button } from './Button';

export function Skeleton({ className }: { className?: string }) {
  return (
    <div className={cn('relative overflow-hidden rounded bg-surface-sunken', className)} aria-hidden>
      <div className="absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-white/70 to-transparent" />
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon: ReactNode;
  title: string;
  description: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col items-center px-6 py-14 text-center', className)}>
      <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-lg border border-line bg-surface text-ink-3">{icon}</div>
      <h3 className="text-sm font-semibold text-ink">{title}</h3>
      <p className="mt-1 max-w-sm text-sm text-ink-3">{description}</p>
      {action && <div className="mt-5 flex flex-wrap justify-center gap-2">{action}</div>}
    </div>
  );
}

export function errorMessage(error: unknown) {
  if (error instanceof ApiError) {
    if (error.code === 'ml_unavailable') return 'The ML service is unavailable. Start it and try again.';
    return error.message;
  }
  if (error instanceof TypeError) return 'Could not reach the Pulse API. Check that it is running.';
  return 'Something went wrong.';
}

export function ErrorState({ error, onRetry, className }: { error: unknown; onRetry?: () => void; className?: string }) {
  return (
    <div role="alert" className={cn('flex flex-col items-center px-6 py-12 text-center', className)}>
      <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-critical-soft text-critical">
        <AlertCircle size={18} aria-hidden />
      </div>
      <p className="text-sm font-medium text-ink">Couldn’t load this data</p>
      <p className="mt-1 max-w-sm text-sm text-ink-3">{errorMessage(error)}</p>
      {onRetry && (
        <Button variant="secondary" size="sm" className="mt-4" icon={<RefreshCw size={14} aria-hidden />} onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}

export function InlineError({ error }: { error: unknown }) {
  if (!error) return null;
  return (
    <div role="alert" className="flex items-start gap-2 rounded-md border border-critical/20 bg-critical-soft px-3 py-2 text-xs text-critical">
      <AlertCircle size={14} className="mt-0.5 shrink-0" aria-hidden />
      <span>{errorMessage(error)}</span>
    </div>
  );
}
