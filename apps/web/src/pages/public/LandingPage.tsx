import { motion, useReducedMotion } from 'framer-motion';
import {
  ArrowRight,
  Binary,
  BrainCircuit,
  Check,
  FileSearch,
  Fingerprint,
  GitBranch,
  KeyRound,
  Layers,
  LineChart,
  Lock,
  RadioTower,
  ShieldCheck,
  Workflow,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Logo } from '@/components/brand/Logo';
import { LiveStream } from '@/components/landing/LiveStream';

function useFadeUp(delay = 0) {
  const reduce = useReducedMotion();
  return reduce
    ? {}
    : {
        initial: { opacity: 0, y: 16 },
        whileInView: { opacity: 1, y: 0 },
        viewport: { once: true, margin: '-60px' },
        transition: { duration: 0.5, delay, ease: [0.2, 0.8, 0.2, 1] },
      };
}

function Section({ id, eyebrow, title, intro, children }: { id: string; eyebrow: string; title: ReactNode; intro?: ReactNode; children: ReactNode }) {
  const fade = useFadeUp();
  return (
    <section id={id} className="relative mx-auto max-w-6xl scroll-mt-20 px-4 py-20 sm:px-6 lg:py-28">
      <motion.div {...fade} className="max-w-2xl">
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-cyan-300">{eyebrow}</p>
        <h2 className="mt-3 font-display text-3xl font-semibold tracking-[-0.02em] text-white sm:text-4xl">{title}</h2>
        {intro && <p className="mt-4 text-base leading-relaxed text-slate-400">{intro}</p>}
      </motion.div>
      <div className="mt-12">{children}</div>
    </section>
  );
}

const FEATURES = [
  {
    icon: RadioTower,
    title: 'Metadata in, never payloads',
    body: 'Send route templates, status codes, latency, sizes and a pseudonymous client id. The schema rejects headers, bodies and tokens outright.',
  },
  {
    icon: BrainCircuit,
    title: 'A real model on every request',
    body: 'Each event is enriched with sliding-window context and scored by a scikit-learn Isolation Forest trained on reproducible traffic.',
  },
  {
    icon: FileSearch,
    title: 'Evidence, not verdicts',
    body: 'Alerts separate what was observed (rates, sizes, latency against baseline) from what the model signalled, so you can judge for yourself.',
  },
  {
    icon: Workflow,
    title: 'An investigation workflow',
    body: 'Related anomalies are grouped per client and pattern. Move alerts through open, investigating, resolved or dismissed, with notes.',
  },
  {
    icon: KeyRound,
    title: 'Project-scoped API keys',
    body: 'High-entropy keys shown once, stored as keyed hashes, revocable instantly and rate limited per key.',
  },
  {
    icon: LineChart,
    title: 'Measured, not marketed',
    body: 'Precision, recall and ROC AUC come from a held-out labelled dataset and sit next to a rule-based baseline in the app.',
  },
];

const PIPELINE = [
  { icon: RadioTower, title: 'Ingest', body: 'POST /ingest/events with a project key. Strict validation and idempotent ids.' },
  { icon: Layers, title: 'Context', body: 'Per-client rates, error and auth-failure ratios, distinct endpoints, route baselines.' },
  { icon: Binary, title: 'Features', body: '17 relative, log-scaled features. No route names, no identities, no payloads.' },
  { icon: BrainCircuit, title: 'Isolation Forest', body: 'Score = how quickly a request is isolated. Threshold = training 99.5th percentile.' },
  { icon: FileSearch, title: 'Alert + evidence', body: 'Grouped alerts with observed evidence and per-feature model sensitivity.' },
];

const SECURITY = [
  'Argon2id password hashing with OWASP parameters',
  '15-minute access tokens held only in memory',
  'Rotating refresh tokens with reuse detection and revocation',
  'HttpOnly, SameSite=Strict cookies plus double-submit CSRF tokens',
  'API keys stored as HMAC-SHA256 hashes, never in URLs or logs',
  'Ownership checks on every project, event, alert and key',
  'Rate limits on sign-in, registration, refresh and ingestion',
  'Strict request schemas, security headers and an explicit CORS allow-list',
];

function ProductPreview() {
  const rows = [
    { sev: 'Critical', tone: 'bg-rose-50 text-rose-700', title: 'Repeated authentication failures', client: 'actor_7f2c', n: 418 },
    { sev: 'High', tone: 'bg-orange-50 text-orange-700', title: 'Client probing many distinct routes', client: 'actor_19ab', n: 126 },
    { sev: 'Medium', tone: 'bg-amber-50 text-amber-700', title: 'Unusually large responses', client: 'client_005', n: 23 },
  ];
  const bars = [14, 18, 16, 22, 19, 24, 21, 26, 23, 20, 25, 28, 24, 22, 27, 30, 26, 61, 72, 33, 25, 23, 27, 24];
  return (
    <div className="relative">
      <div className="pointer-events-none absolute -inset-x-10 -inset-y-10 rounded-[40px] bg-[radial-gradient(60%_60%_at_50%_40%,rgba(124,92,255,0.18),transparent)]" />
      <div className="relative overflow-hidden rounded-xl border border-white/10 bg-[#F5F7FB] shadow-[0_40px_120px_-40px_rgba(0,0,0,0.8)]">
        <div className="flex items-center gap-2 border-b border-slate-200 bg-white px-4 py-2.5">
          <span className="h-2.5 w-2.5 rounded-full bg-slate-200" />
          <span className="h-2.5 w-2.5 rounded-full bg-slate-200" />
          <span className="h-2.5 w-2.5 rounded-full bg-slate-200" />
          <span className="ml-3 text-[11px] font-medium text-slate-500">Overview · Checkout API</span>
          <span className="ml-auto rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-semibold text-violet-700">Product preview · simulated data</span>
        </div>
        <div className="grid gap-3 p-4 md:grid-cols-[1.4fr_1fr]">
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-3">
              {[
                ['Requests', '48.2K'],
                ['Error rate', '2.4%'],
                ['Anomalies', '312'],
              ].map(([k, v]) => (
                <div key={k} className="rounded-lg border border-slate-200 bg-white p-3">
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">{k}</div>
                  <div className={`mt-1.5 font-display text-xl font-semibold ${k === 'Anomalies' ? 'text-violet-700' : 'text-slate-900'}`}>{v}</div>
                </div>
              ))}
            </div>
            <div className="rounded-lg border border-slate-200 bg-white p-3">
              <div className="mb-2 text-[11px] font-semibold text-slate-700">Request volume</div>
              <div className="flex h-24 items-end gap-[3px]">
                {bars.map((b, i) => (
                  <div key={i} className={`flex-1 rounded-t-[3px] ${b > 50 ? 'bg-violet-500' : 'bg-cyan-600/80'}`} style={{ height: `${b}%` }} />
                ))}
              </div>
            </div>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white">
            <div className="border-b border-slate-200 px-3 py-2 text-[11px] font-semibold text-slate-700">Open alerts</div>
            <ul className="divide-y divide-slate-100">
              {rows.map((r) => (
                <li key={r.title} className="px-3 py-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-[12px] font-medium text-slate-900">{r.title}</span>
                    <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-semibold ${r.tone}`}>
                      {r.sev}
                    </span>
                  </div>
                  <div className="mt-0.5 font-mono text-[10px] text-slate-500">
                    {r.client} · {r.n} events
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function LandingPage() {
  const reduce = useReducedMotion();
  const heroFade = (delay: number) =>
    reduce ? {} : { initial: { opacity: 0, y: 14 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.6, delay, ease: [0.2, 0.8, 0.2, 1] } };
  const fade = useFadeUp();

  return (
    <div className="theme-dark min-h-screen overflow-x-hidden bg-navy-950 text-slate-300">
      {/* Backdrop */}
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-[900px] overflow-hidden">
        <div className="grid-backdrop absolute inset-0 [mask-image:radial-gradient(70%_60%_at_50%_0%,black,transparent)]" />
        <div className="absolute left-1/2 top-[-280px] h-[620px] w-[980px] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,rgba(46,230,245,0.16),transparent)]" />
        <div className="absolute right-[-200px] top-[180px] h-[420px] w-[520px] rounded-full bg-[radial-gradient(closest-side,rgba(124,92,255,0.16),transparent)]" />
      </div>

      <header className="sticky top-0 z-40 border-b border-white/5 bg-navy-950/70 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Link to="/" aria-label="Pulse home">
            <Logo dark />
          </Link>
          <nav className="hidden items-center gap-7 text-[13px] text-slate-400 md:flex" aria-label="Sections">
            <a href="#product" className="hover:text-white">Product</a>
            <a href="#how" className="hover:text-white">How it works</a>
            <a href="#security" className="hover:text-white">Security</a>
            <a href="/api/v1/docs" className="hover:text-white">API reference</a>
          </nav>
          <div className="flex items-center gap-2">
            <Link to="/login" className="rounded-md px-3 py-2 text-[13px] font-medium text-slate-300 hover:text-white">
              Sign in
            </Link>
            <Link
              to="/register"
              className="inline-flex h-9 items-center gap-1.5 rounded-md bg-cyan-400 px-3.5 text-[13px] font-semibold text-navy-950 shadow-glow transition-colors hover:bg-cyan-300"
            >
              Get started <ArrowRight size={14} aria-hidden />
            </Link>
          </div>
        </div>
      </header>

      <main>
        {/* Hero */}
        <section className="relative mx-auto grid max-w-6xl items-center gap-12 px-4 pb-20 pt-16 sm:px-6 lg:grid-cols-[1.05fr_1fr] lg:pb-28 lg:pt-24">
          <div>
            <motion.div {...heroFade(0)} className="inline-flex items-center gap-2 rounded-full border border-cyan-400/20 bg-cyan-400/5 px-3 py-1 text-xs text-cyan-200">
              <span className="h-1.5 w-1.5 rounded-full bg-cyan-400" />
              AI-powered API threat intelligence
            </motion.div>
            <motion.h1
              {...heroFade(0.06)}
              className="mt-6 font-display text-[2.6rem] font-semibold leading-[1.04] tracking-[-0.035em] text-white sm:text-6xl lg:text-[4rem]"
            >
              Find the requests that{' '}
              <span className="bg-gradient-to-r from-cyan-300 via-cyan-400 to-violet-400 bg-clip-text text-transparent">don’t belong.</span>
            </motion.h1>
            <motion.p {...heroFade(0.12)} className="mt-6 max-w-xl text-lg leading-relaxed text-slate-400">
              Pulse learns how your API normally behaves from request metadata, scores every call with an Isolation Forest, and turns the
              unusual ones into alerts with the evidence attached.
            </motion.p>
            <motion.div {...heroFade(0.18)} className="mt-9 flex flex-wrap items-center gap-3">
              <Link
                to="/register"
                className="inline-flex h-12 items-center gap-2 rounded-md bg-cyan-400 px-5 text-sm font-semibold text-navy-950 shadow-glow transition-colors hover:bg-cyan-300"
              >
                Create a free account <ArrowRight size={16} aria-hidden />
              </Link>
              <Link
                to="/register?intent=demo"
                className="inline-flex h-12 items-center gap-2 rounded-md border border-white/15 bg-white/[0.03] px-5 text-sm font-semibold text-white transition-colors hover:border-white/30 hover:bg-white/[0.06]"
              >
                Try it with demo traffic
              </Link>
            </motion.div>
            <motion.ul {...heroFade(0.24)} className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-[13px] text-slate-500">
              {['No payloads collected', 'Runs locally, no paid AI', 'Open evaluation'].map((t) => (
                <li key={t} className="inline-flex items-center gap-1.5">
                  <Check size={14} className="text-cyan-400" aria-hidden /> {t}
                </li>
              ))}
            </motion.ul>
          </div>
          <motion.div {...heroFade(0.2)}>
            <LiveStream />
          </motion.div>
        </section>

        {/* Product preview */}
        <section id="product" className="relative mx-auto max-w-6xl scroll-mt-20 px-4 sm:px-6">
          <motion.div {...fade}>
            <ProductPreview />
          </motion.div>
        </section>

        <Section
          id="features"
          eyebrow="Product"
          title="From raw traffic to a decision you can defend."
          intro="Pulse is built around one promise: understand API activity, identify unusual behaviour, and investigate the evidence behind it."
        >
          <div className="grid gap-px overflow-hidden rounded-xl border border-white/10 bg-white/10 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f, i) => (
              <FeatureCard key={f.title} index={i} {...f} />
            ))}
          </div>
        </Section>

        <Section
          id="how"
          eyebrow="How it works"
          title="An unsupervised model, an explainable pipeline."
          intro="Isolation Forest isolates points with random splits. Requests that separate from normal traffic in very few splits score higher. Pulse reports that score as a ranking signal, never as a probability of attack."
        >
          <ol className="relative grid gap-4 md:grid-cols-5">
            <div aria-hidden className="absolute left-0 right-0 top-7 hidden h-px bg-gradient-to-r from-cyan-400/0 via-cyan-400/40 to-violet-400/0 md:block" />
            {PIPELINE.map((s, i) => (
              <PipelineStep key={s.title} index={i} {...s} />
            ))}
          </ol>
          <div className="mt-10 grid gap-4 md:grid-cols-2">
            <div className="rounded-xl border border-white/10 bg-white/[0.02] p-6">
              <p className="font-mono text-xs uppercase tracking-wider text-cyan-300">Observed evidence</p>
              <p className="mt-3 font-mono text-sm text-slate-200">Client request rate of 142 req/min, 47× the baseline median (3 req/min).</p>
              <p className="mt-2 font-mono text-sm text-slate-200">Auth-failure rate (5 min) is 91% (baseline median 0%).</p>
              <p className="mt-4 text-xs text-slate-500">Computed directly from the event and its window. Example shown; real alerts use your data.</p>
            </div>
            <div className="rounded-xl border border-violet-400/20 bg-violet-500/[0.04] p-6">
              <p className="font-mono text-xs uppercase tracking-wider text-violet-300">Model signal</p>
              <div className="mt-3 space-y-2.5">
                {[
                  ['Client request rate (1 min)', 92],
                  ['Client auth-failure rate (5 min)', 64],
                  ['Distinct routes touched (5 min)', 22],
                ].map(([label, w]) => (
                  <div key={label as string}>
                    <div className="mb-1 text-xs text-slate-300">{label}</div>
                    <div className="h-1.5 rounded-full bg-white/5">
                      <div className="h-full rounded-full bg-gradient-to-r from-violet-500 to-violet-300" style={{ width: `${w}%` }} />
                    </div>
                  </div>
                ))}
              </div>
              <p className="mt-4 text-xs text-slate-500">Feature sensitivity: how much the score drops when one feature is reset to normal.</p>
            </div>
          </div>
        </Section>

        <Section
          id="security"
          eyebrow="Security"
          title="Security controls you can read in the code."
          intro="Pulse is a security product, so its own authentication is held to the same standard. Every control below is implemented server-side and covered by tests."
        >
          <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
            <div className="grid grid-cols-2 gap-4">
              {[
                { icon: Fingerprint, label: 'Argon2id' },
                { icon: GitBranch, label: 'Token rotation' },
                { icon: Lock, label: 'CSRF + SameSite' },
                { icon: ShieldCheck, label: 'Per-project authz' },
              ].map(({ icon: Icon, label }) => (
                <div key={label} className="flex flex-col justify-between rounded-xl border border-white/10 bg-gradient-to-b from-white/[0.04] to-transparent p-5">
                  <Icon size={20} className="text-cyan-300" aria-hidden />
                  <span className="mt-8 font-display text-base font-medium text-white">{label}</span>
                </div>
              ))}
            </div>
            <ul className="divide-y divide-white/5 rounded-xl border border-white/10 bg-white/[0.02]">
              {SECURITY.map((s) => (
                <li key={s} className="flex items-start gap-3 px-5 py-3.5 text-sm text-slate-300">
                  <Check size={16} className="mt-0.5 shrink-0 text-cyan-400" aria-hidden />
                  {s}
                </li>
              ))}
            </ul>
          </div>
        </Section>

        <section className="relative mx-auto max-w-6xl px-4 pb-24 sm:px-6">
          <motion.div
            {...fade}
            className="relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-navy-800 via-navy-900 to-navy-950 px-6 py-14 text-center sm:px-12"
          >
            <div aria-hidden className="absolute inset-0 bg-[radial-gradient(50%_80%_at_50%_0%,rgba(46,230,245,0.18),transparent)]" />
            <h2 className="relative font-display text-3xl font-semibold tracking-[-0.02em] text-white sm:text-4xl">Point your traffic at Pulse.</h2>
            <p className="relative mx-auto mt-4 max-w-xl text-slate-400">
              Create a project, issue a key and send your first event in a few minutes. Or start with a demo project of clearly labelled simulated traffic.
            </p>
            <div className="relative mt-8 flex flex-wrap justify-center gap-3">
              <Link to="/register" className="inline-flex h-11 items-center gap-2 rounded-md bg-cyan-400 px-5 text-sm font-semibold text-navy-950 hover:bg-cyan-300">
                Get started <ArrowRight size={16} aria-hidden />
              </Link>
              <Link to="/login" className="inline-flex h-11 items-center rounded-md border border-white/15 px-5 text-sm font-semibold text-white hover:border-white/30">
                Sign in
              </Link>
            </div>
          </motion.div>
        </section>
      </main>

      <footer className="border-t border-white/5">
        <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-10 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div>
            <Logo dark size={24} />
            <p className="mt-2 text-xs text-slate-500">AI-powered API threat intelligence. An early-stage MVP.</p>
          </div>
          <nav className="flex flex-wrap gap-6 text-xs text-slate-400" aria-label="Footer">
            <a href="#features" className="hover:text-white">Product</a>
            <a href="#how" className="hover:text-white">How it works</a>
            <a href="#security" className="hover:text-white">Security</a>
            <a href="/api/v1/docs" className="hover:text-white">API reference</a>
            <Link to="/login" className="hover:text-white">Sign in</Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}

function FeatureCard({ icon: Icon, title, body, index }: { icon: typeof Check; title: string; body: string; index: number }) {
  const fade = useFadeUp(index * 0.05);
  return (
    <motion.div {...fade} className="group relative bg-navy-950 p-7 transition-colors hover:bg-navy-900">
      <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-white/10 bg-white/[0.03] text-cyan-300 transition-shadow group-hover:shadow-glow">
        <Icon size={18} aria-hidden />
      </div>
      <h3 className="mt-5 font-display text-lg font-medium text-white">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-slate-400">{body}</p>
    </motion.div>
  );
}

function PipelineStep({ icon: Icon, title, body, index }: { icon: typeof Check; title: string; body: string; index: number }) {
  const fade = useFadeUp(index * 0.08);
  return (
    <motion.li {...fade} className="relative">
      <div className="relative z-10 flex h-14 w-14 items-center justify-center rounded-xl border border-white/10 bg-navy-900 text-cyan-300">
        <Icon size={20} aria-hidden />
        <span className="absolute -right-2 -top-2 flex h-5 w-5 items-center justify-center rounded-full bg-violet-500 font-mono text-[10px] font-semibold text-white">
          {index + 1}
        </span>
      </div>
      <h3 className="mt-4 font-display text-base font-medium text-white">{title}</h3>
      <p className="mt-1.5 text-[13px] leading-relaxed text-slate-400">{body}</p>
    </motion.li>
  );
}
