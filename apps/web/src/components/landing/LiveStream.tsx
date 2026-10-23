import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';

/**
 * A clearly labelled simulated request stream for the landing page. Points are
 * generated in the browser from a seeded PRNG; nothing here comes from a backend.
 */
interface Point {
  id: number;
  t: number;
  y: number;
  anomaly: boolean;
}

const W = 560;
const H = 220;
const WINDOW = 90;

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const INCIDENTS = [
  { title: 'Repeated authentication failures', detail: 'POST /v1/auth/login · 142 req/min · 91% 401', score: '0.742' },
  { title: 'Client probing many distinct routes', detail: '38 endpoints in 5 min · 84% 404', score: '0.711' },
  { title: 'Unusually large responses', detail: 'GET /v1/reports/export · 96× route median', score: '0.668' },
];

export function LiveStream() {
  const reduce = useReducedMotion();
  const rand = useRef(mulberry32(7));
  const [tick, setTick] = useState(WINDOW);
  const [points, setPoints] = useState<Point[]>(() => {
    const r = mulberry32(3);
    return Array.from({ length: WINDOW * 2 }, (_, i) => ({ id: i, t: i / 2, y: 0.35 + r() * 0.3 + (r() < 0.04 ? 0.25 : 0), anomaly: false }));
  });
  const [incident, setIncident] = useState(0);
  const [burst, setBurst] = useState(false);

  useEffect(() => {
    if (reduce) return;
    const timer = setInterval(() => {
      setTick((t) => t + 1);
    }, 220);
    return () => clearInterval(timer);
  }, [reduce]);

  useEffect(() => {
    if (reduce) return;
    const r = rand.current;
    const inBurst = tick % 40 > 31;
    setBurst(inBurst);
    if (tick % 40 === 32) setIncident((i) => (i + 1) % INCIDENTS.length);
    setPoints((prev) => {
      // StrictMode re-runs effects in development; add each tick's points once.
      if (prev.some((p) => p.id === tick * 10)) return prev;
      const next = prev.filter((p) => p.t > tick - WINDOW);
      const n = inBurst ? 5 : 2;
      for (let k = 0; k < n; k++) {
        const anomaly = inBurst && r() < 0.75;
        next.push({
          id: tick * 10 + k,
          t: tick + k / n,
          y: anomaly ? 0.7 + r() * 0.22 : 0.32 + r() * 0.3 + (r() < 0.03 ? 0.2 : 0),
          anomaly,
        });
      }
      return next;
    });
  }, [tick, reduce]);

  const x = (t: number) => ((t - (tick - WINDOW)) / WINDOW) * W;
  const y = (v: number) => H - v * H;
  const threshold = 0.66;
  const current = INCIDENTS[incident]!;

  return (
    <div className="relative overflow-hidden rounded-xl border border-white/10 bg-navy-900/70 shadow-[0_30px_80px_-30px_rgba(46,230,245,0.35)] backdrop-blur">
      <div className="flex items-center justify-between border-b border-white/5 px-4 py-3">
        <div className="flex items-center gap-2.5">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-pulse-ring rounded-full bg-cyan-400" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-cyan-400" />
          </span>
          <span className="text-xs font-medium text-slate-200">Anomaly score per request</span>
        </div>
        <span className="rounded-full border border-violet-400/30 bg-violet-500/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-violet-300">
          Simulated stream
        </span>
      </div>
      <div className="relative px-2 pb-2 pt-4">
        <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Animated, simulated stream of request anomaly scores with a threshold line">
          {[0.25, 0.5, 0.75].map((g) => (
            <line key={g} x1={0} x2={W} y1={y(g)} y2={y(g)} stroke="rgba(148,163,184,0.08)" />
          ))}
          <line x1={0} x2={W} y1={y(threshold)} y2={y(threshold)} stroke="rgba(156,133,255,0.6)" strokeDasharray="4 5" />
          <text x={W - 6} y={y(threshold) - 6} textAnchor="end" className="fill-violet-300" fontSize="10">
            alert threshold
          </text>
          {points.map((p) =>
            p.anomaly ? (
              <g key={p.id}>
                <circle cx={x(p.t)} cy={y(p.y)} r={7} fill="rgba(124,92,255,0.18)" />
                <circle cx={x(p.t)} cy={y(p.y)} r={3.2} fill="#9C85FF" stroke="#0A0F24" strokeWidth={1.5} />
              </g>
            ) : (
              <circle key={p.id} cx={x(p.t)} cy={y(p.y)} r={2.2} fill="#2EE6F5" fillOpacity={0.75} />
            ),
          )}
        </svg>
        <AnimatePresence>
          {(burst || reduce) && (
            <motion.div
              key={incident}
              initial={{ opacity: 0, y: 8, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.25 }}
              className="absolute right-4 top-5 w-64 rounded-lg border border-violet-400/30 bg-navy-950/90 p-3 shadow-glow-violet"
            >
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-violet-300">Alert · high</span>
                <span className="font-mono text-[11px] text-violet-200">score {current.score}</span>
              </div>
              <p className="mt-1.5 text-[13px] font-medium text-white">{current.title}</p>
              <p className="mt-0.5 font-mono text-[11px] text-slate-400">{current.detail}</p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      <div className="flex items-center gap-4 border-t border-white/5 px-4 py-2.5 text-[11px] text-slate-400">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-cyan-400" /> typical request
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-violet-400" /> flagged by model
        </span>
        <span className="ml-auto hidden sm:inline">Illustrative data generated in your browser</span>
      </div>
    </div>
  );
}
