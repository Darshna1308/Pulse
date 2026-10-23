import { motion, useReducedMotion } from 'framer-motion';
import { ShieldCheck } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Logo } from '@/components/brand/Logo';

const POINTS = [
  'Argon2id password hashing and rotating refresh sessions',
  'Isolation Forest scoring with evidence you can verify',
  'Project-scoped API keys, shown once and stored hashed',
];

export function AuthShell({ title, subtitle, children, footer }: { title: string; subtitle: string; children: ReactNode; footer: ReactNode }) {
  const reduce = useReducedMotion();
  return (
    <div className="relative min-h-screen overflow-hidden bg-navy-950 text-slate-200">
      <div className="grid-backdrop pointer-events-none absolute inset-0 opacity-60" aria-hidden />
      <div
        className="pointer-events-none absolute -top-40 left-1/2 h-[520px] w-[820px] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,rgba(46,230,245,0.16),transparent)]"
        aria-hidden
      />
      <div className="relative mx-auto grid min-h-screen max-w-6xl items-center gap-12 px-4 py-10 sm:px-6 lg:grid-cols-[1fr_440px]">
        <div className="hidden lg:block">
          <Link to="/" className="inline-block rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400">
            <Logo dark size={32} />
          </Link>
          <h2 className="mt-10 max-w-md font-display text-4xl font-semibold leading-tight tracking-[-0.03em] text-white">
            See the requests that don’t look like the rest.
          </h2>
          <ul className="mt-8 space-y-3">
            {POINTS.map((p) => (
              <li key={p} className="flex items-start gap-3 text-sm text-slate-400">
                <ShieldCheck size={18} className="mt-0.5 shrink-0 text-cyan-400" aria-hidden />
                {p}
              </li>
            ))}
          </ul>
        </div>

        <motion.main
          initial={reduce ? false : { opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: 'easeOut' }}
          className="w-full"
        >
          <div className="mb-8 lg:hidden">
            <Link to="/">
              <Logo dark size={30} />
            </Link>
          </div>
          <div className="rounded-2xl border border-white/10 bg-navy-900/70 p-6 shadow-[0_30px_80px_-30px_rgba(0,0,0,0.8)] backdrop-blur sm:p-8">
            <h1 className="font-display text-2xl font-semibold tracking-[-0.02em] text-white">{title}</h1>
            <p className="mt-1.5 text-sm text-slate-400">{subtitle}</p>
            <div className="mt-7">{children}</div>
          </div>
          <p className="mt-6 text-center text-sm text-slate-400">{footer}</p>
        </motion.main>
      </div>
    </div>
  );
}

export function FormError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <div role="alert" className="mb-5 rounded-md border border-rose-400/30 bg-rose-500/10 px-3.5 py-2.5 text-sm text-rose-200">
      {message}
    </div>
  );
}
