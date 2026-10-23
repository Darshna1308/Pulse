import { Link } from 'react-router-dom';
import { Logo } from '@/components/brand/Logo';

export default function NotFoundPage() {
  return (
    <div className="grid min-h-screen place-items-center bg-navy-950 px-4 text-center text-slate-300">
      <div>
        <Logo dark size={32} className="justify-center" />
        <p className="mt-10 font-mono text-sm text-cyan-300">404</p>
        <h1 className="mt-2 font-display text-3xl font-semibold text-white">This page doesn’t exist</h1>
        <p className="mt-3 text-sm text-slate-400">The link may be broken, or the page may have moved.</p>
        <div className="mt-8 flex justify-center gap-3">
          <Link to="/" className="rounded-md border border-white/15 px-4 py-2 text-sm font-medium text-white hover:bg-white/5">
            Home
          </Link>
          <Link to="/app" className="rounded-md bg-cyan-400 px-4 py-2 text-sm font-semibold text-navy-950 hover:bg-cyan-300">
            Open dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
