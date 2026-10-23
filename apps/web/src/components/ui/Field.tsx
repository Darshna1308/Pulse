import { forwardRef, useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

const control =
  'block w-full rounded-md border bg-white px-3 text-sm text-ink placeholder:text-ink-4 transition-colors focus:border-cyan-600 focus:outline-none focus:ring-2 focus:ring-cyan-500/30 disabled:bg-surface disabled:text-ink-3';

export function Field({
  label,
  error,
  hint,
  children,
  id,
  dark,
}: {
  label: string;
  error?: string;
  hint?: ReactNode;
  children: (props: { id: string; 'aria-invalid'?: boolean; 'aria-describedby'?: string }) => ReactNode;
  id?: string;
  dark?: boolean;
}) {
  const auto = useId();
  const fieldId = id ?? auto;
  const describedBy = error ? `${fieldId}-error` : hint ? `${fieldId}-hint` : undefined;
  return (
    <div className="space-y-1.5">
      <label htmlFor={fieldId} className={cn('block text-xs font-medium', dark ? 'text-slate-300' : 'text-ink-2')}>
        {label}
      </label>
      {children({ id: fieldId, 'aria-invalid': error ? true : undefined, 'aria-describedby': describedBy })}
      {error ? (
        <p id={`${fieldId}-error`} className={cn('text-xs', dark ? 'text-rose-300' : 'text-critical')} role="alert">
          {error}
        </p>
      ) : hint ? (
        <p id={`${fieldId}-hint`} className={cn('text-xs', dark ? 'text-slate-400' : 'text-ink-3')}>
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }>(function Input(
  { className, invalid, ...rest },
  ref,
) {
  return <input ref={ref} className={cn(control, 'h-9', invalid || rest['aria-invalid'] ? 'border-critical' : 'border-line-strong', className)} {...rest} />;
});

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select({ className, ...rest }, ref) {
  return <select ref={ref} className={cn(control, 'h-9 border-line-strong pr-8', className)} {...rest} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, ...rest }, ref) {
  return <textarea ref={ref} className={cn(control, 'min-h-[84px] border-line-strong py-2', className)} {...rest} />;
});

/** Dark-theme input used on the public auth pages. */
export const DarkInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function DarkInput({ className, ...rest }, ref) {
  return (
    <input
      ref={ref}
      className={cn(
        'block h-11 w-full rounded-md border bg-navy-900/80 px-3.5 text-sm text-white placeholder:text-slate-500 transition-colors focus:border-cyan-400 focus:outline-none focus:ring-2 focus:ring-cyan-400/25',
        rest['aria-invalid'] ? 'border-rose-400/70' : 'border-white/10',
        className,
      )}
      {...rest}
    />
  );
});
