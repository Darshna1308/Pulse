import { cn } from '@/lib/cn';
import { PulseMark } from '../brand/Logo';

export function Spinner({ size = 16, className }: { size?: number; className?: string }) {
  return (
    <svg className={cn('animate-spin', className)} width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.2" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export function FullPageSpinner({ label, dark }: { label: string; dark?: boolean }) {
  return (
    <div
      role="status"
      className={cn('flex min-h-screen flex-col items-center justify-center gap-4', dark ? 'theme-dark bg-navy-950 text-white' : 'bg-surface text-ink-3')}
    >
      <PulseMark size={36} animated />
      <span className="text-sm">{label}…</span>
    </div>
  );
}
