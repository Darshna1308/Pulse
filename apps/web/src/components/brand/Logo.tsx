import { useId } from 'react';
import { cn } from '@/lib/cn';

/** The Pulse mark: a heartbeat trace crossing a soft-cornered tile. */
export function PulseMark({ size = 28, animated = false, className }: { size?: number; animated?: boolean; className?: string }) {
  const id = useId().replace(/:/g, '');
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" className={className} aria-hidden>
      <defs>
        <linearGradient id={`pm-${id}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#2EE6F5" />
          <stop offset="1" stopColor="#7C5CFF" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="8" fill="#0A0F24" />
      <rect x="0.5" y="0.5" width="31" height="31" rx="7.5" fill="none" stroke="white" strokeOpacity="0.08" />
      <path
        d="M5 17h5l2.5-6 4 12 3-9 1.8 3H27"
        fill="none"
        stroke={`url(#pm-${id})`}
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        pathLength={1}
        strokeDasharray={animated ? 1 : undefined}
        className={animated ? 'motion-safe:animate-[dash_1.6s_ease-in-out_infinite]' : undefined}
        style={animated ? { strokeDashoffset: 0 } : undefined}
      />
      {animated && <style>{`@keyframes dash{0%{stroke-dashoffset:1}60%{stroke-dashoffset:0}100%{stroke-dashoffset:-1}}`}</style>}
    </svg>
  );
}

export function Logo({ dark = false, size = 28, className }: { dark?: boolean; size?: number; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <PulseMark size={size} />
      <span className={cn('font-display text-[1.15rem] font-semibold tracking-[-0.02em]', dark ? 'text-white' : 'text-ink')}>
        pulse
      </span>
    </span>
  );
}
