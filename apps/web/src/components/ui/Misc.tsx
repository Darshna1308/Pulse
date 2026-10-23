import { Check, ChevronLeft, ChevronRight, Copy, Info } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import type { PageMeta } from '@/api/types';
import { cn } from '@/lib/cn';
import { fmtNumber } from '@/lib/format';
import { Button } from './Button';

export function Tooltip({ content, children, className }: { content: ReactNode; children: ReactNode; className?: string }) {
  return (
    <span className={cn('group relative inline-flex', className)}>
      {children}
      <span
        role="tooltip"
        className="pointer-events-none absolute bottom-full left-1/2 z-40 mb-2 w-max max-w-[260px] -translate-x-1/2 rounded-md bg-navy-900 px-2.5 py-1.5 text-xs font-normal leading-snug text-white opacity-0 shadow-pop transition-opacity duration-150 group-focus-within:opacity-100 group-hover:opacity-100"
      >
        {content}
      </span>
    </span>
  );
}

export function InfoTip({ content, label = 'More information' }: { content: ReactNode; label?: string }) {
  return (
    <Tooltip content={content}>
      <button type="button" aria-label={label} className="rounded text-ink-4 hover:text-ink-2">
        <Info size={13} aria-hidden />
      </button>
    </Tooltip>
  );
}

export function CopyButton({ value, label = 'Copy', className }: { value: string; label?: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      variant="secondary"
      size="sm"
      className={className}
      icon={copied ? <Check size={14} className="text-ok" aria-hidden /> : <Copy size={14} aria-hidden />}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1800);
        } catch {
          /* clipboard blocked: the value is still selectable on screen */
        }
      }}
    >
      {copied ? 'Copied' : label}
    </Button>
  );
}

export function Pagination({ meta, onPage }: { meta: PageMeta | undefined; onPage: (page: number) => void }) {
  if (!meta || meta.total === 0) return null;
  const start = (meta.page - 1) * meta.pageSize + 1;
  const end = Math.min(meta.total, meta.page * meta.pageSize);
  return (
    <div className="flex items-center justify-between gap-4 border-t border-line px-5 py-3 text-xs text-ink-3">
      <span className="tabular">
        {fmtNumber(start)}–{fmtNumber(end)} of {fmtNumber(meta.total)}
      </span>
      <div className="flex items-center gap-1">
        <Button variant="ghost" size="sm" disabled={meta.page <= 1} onClick={() => onPage(meta.page - 1)} icon={<ChevronLeft size={14} aria-hidden />}>
          Previous
        </Button>
        <span className="px-2 tabular">
          Page {meta.page} of {meta.totalPages}
        </span>
        <Button variant="ghost" size="sm" disabled={meta.page >= meta.totalPages} onClick={() => onPage(meta.page + 1)}>
          Next
          <ChevronRight size={14} aria-hidden />
        </Button>
      </div>
    </div>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-md border border-line-strong bg-white p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            'h-7 rounded-[5px] px-2.5 text-xs font-medium transition-colors',
            value === o.value ? 'bg-navy-900 text-white' : 'text-ink-3 hover:text-ink',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
