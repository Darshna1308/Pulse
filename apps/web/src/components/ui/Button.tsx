import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { Spinner } from './Spinner';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'accent';
type Size = 'sm' | 'md' | 'lg';

const variants: Record<Variant, string> = {
  primary: 'bg-navy-900 text-white hover:bg-navy-700 disabled:bg-navy-900/50',
  secondary: 'bg-white text-ink border border-line-strong hover:bg-surface hover:border-ink-4 disabled:text-ink-4',
  ghost: 'text-ink-2 hover:bg-surface-sunken hover:text-ink disabled:text-ink-4',
  danger: 'bg-white text-critical border border-critical/30 hover:bg-critical-soft disabled:opacity-50',
  accent:
    'bg-cyan-400 text-navy-950 hover:bg-cyan-300 shadow-[0_0_0_1px_rgba(46,230,245,0.4),0_8px_24px_-8px_rgba(46,230,245,0.6)] disabled:opacity-60',
};

const sizes: Record<Size, string> = {
  sm: 'h-8 px-3 text-xs gap-1.5',
  md: 'h-9 px-3.5 text-sm gap-2',
  lg: 'h-11 px-5 text-sm gap-2',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', loading, icon, className, children, disabled, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        'inline-flex select-none items-center justify-center whitespace-nowrap rounded-md font-medium transition-colors duration-150 disabled:cursor-not-allowed',
        variants[variant],
        sizes[size],
        className,
      )}
      {...rest}
    >
      {loading ? <Spinner size={14} /> : icon}
      {children}
    </button>
  );
});
