import { AnimatePresence, motion } from 'framer-motion';
import {
  Activity,
  BarChart3,
  BookOpen,
  Bell,
  ChevronsUpDown,
  FolderKanban,
  KeyRound,
  LayoutDashboard,
  LogOut,
  Menu,
  Settings,
  X,
} from 'lucide-react';
import { Suspense, useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/auth/AuthProvider';
import { cn } from '@/lib/cn';
import { useProject } from '@/lib/useProject';
import { Spinner } from '@/components/ui/Spinner';
import { Logo } from '../brand/Logo';
import { Badge } from '../ui/Badge';

const NAV = [
  { to: '/app', label: 'Overview', icon: LayoutDashboard, end: true },
  { to: '/app/alerts', label: 'Alerts', icon: Bell },
  { to: '/app/events', label: 'API events', icon: Activity },
  { to: '/app/analytics', label: 'Model & analytics', icon: BarChart3 },
  { to: '/app/keys', label: 'API keys', icon: KeyRound },
  { to: '/app/projects', label: 'Projects', icon: FolderKanban },
  { to: '/app/settings', label: 'Settings', icon: Settings },
];

function ProjectSwitcher() {
  const { projects, project, select } = useProject();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex w-full items-center gap-2.5 rounded-md border border-line bg-white px-2.5 py-2 text-left hover:border-line-strong"
      >
        <span
          className={cn(
            'flex h-7 w-7 shrink-0 items-center justify-center rounded-md font-display text-xs font-semibold',
            project?.isDemo ? 'bg-violet-200/60 text-violet-700' : 'bg-cyan-200/60 text-cyan-800',
          )}
        >
          {project?.name.slice(0, 1).toUpperCase() ?? '—'}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-medium text-ink">{project?.name ?? 'No project yet'}</span>
          <span className="block truncate text-2xs text-ink-3">{project ? (project.isDemo ? 'Simulated data' : project.environment) : 'Create one to start'}</span>
        </span>
        <ChevronsUpDown size={14} className="text-ink-4" aria-hidden />
      </button>
      {open && (
        <div role="listbox" className="absolute left-0 right-0 top-full z-30 mt-1 overflow-hidden rounded-md border border-line bg-white py-1 shadow-pop">
          {projects.map((p) => (
            <button
              key={p.id}
              role="option"
              aria-selected={p.id === project?.id}
              onClick={() => {
                select(p.id);
                setOpen(false);
              }}
              className={cn('flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-[13px] hover:bg-surface', p.id === project?.id && 'bg-surface font-medium')}
            >
              <span className="truncate">{p.name}</span>
              {p.isDemo && <Badge tone="violet">Demo</Badge>}
            </button>
          ))}
          <button
            onClick={() => {
              setOpen(false);
              navigate('/app/projects');
            }}
            className="w-full border-t border-line px-3 py-2 text-left text-[13px] text-cyan-700 hover:bg-surface"
          >
            Manage projects
          </button>
        </div>
      )}
    </div>
  );
}

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const { user, logout } = useAuth();
  return (
    <div className="flex h-full flex-col">
      <div className="flex h-14 items-center px-4">
        <NavLink to="/app" onClick={onNavigate} aria-label="Pulse overview">
          <Logo size={26} />
        </NavLink>
      </div>
      <div className="px-3 pb-3">
        <ProjectSwitcher />
      </div>
      <nav className="flex-1 space-y-0.5 px-3" aria-label="Main">
        {NAV.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            onClick={onNavigate}
            className={({ isActive }) =>
              cn(
                'group relative flex items-center gap-2.5 rounded-md px-2.5 py-2 text-[13px] font-medium transition-colors',
                isActive ? 'bg-white text-ink shadow-card' : 'text-ink-2 hover:bg-white/60 hover:text-ink',
              )
            }
          >
            {({ isActive }) => (
              <>
                {isActive && <span className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-cyan-500" aria-hidden />}
                <Icon size={16} className={isActive ? 'text-cyan-700' : 'text-ink-3 group-hover:text-ink-2'} aria-hidden />
                {label}
              </>
            )}
          </NavLink>
        ))}
      </nav>
      <div className="space-y-1 border-t border-line p-3">
        <a
          href="/api/v1/docs"
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-2.5 rounded-md px-2.5 py-2 text-[13px] font-medium text-ink-2 hover:bg-white/60 hover:text-ink"
        >
          <BookOpen size={16} className="text-ink-3" aria-hidden />
          API reference
        </a>
        <div className="flex items-center gap-2.5 rounded-md px-2.5 py-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-navy-900 text-2xs font-semibold text-white">
            {user?.name.slice(0, 1).toUpperCase()}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13px] font-medium">{user?.name}</span>
            <span className="block truncate text-2xs text-ink-3">{user?.email}</span>
          </span>
          <button onClick={() => void logout()} className="rounded p-1.5 text-ink-3 hover:bg-white hover:text-ink" aria-label="Sign out" title="Sign out">
            <LogOut size={15} />
          </button>
        </div>
      </div>
    </div>
  );
}

export function AppLayout() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();
  useEffect(() => setMobileOpen(false), [location.pathname]);

  return (
    <div className="min-h-screen bg-surface">
      <aside className="fixed inset-y-0 left-0 hidden w-60 border-r border-line bg-surface-sunken/60 lg:block">
        <Sidebar />
      </aside>

      <div className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-line bg-white/90 px-4 backdrop-blur lg:hidden">
        <Logo size={24} />
        <button onClick={() => setMobileOpen(true)} className="rounded-md p-2 text-ink-2 hover:bg-surface" aria-label="Open navigation">
          <Menu size={18} />
        </button>
      </div>
      <AnimatePresence>
        {mobileOpen && (
          <div className="fixed inset-0 z-40 lg:hidden">
            <motion.div className="absolute inset-0 bg-navy-950/40" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setMobileOpen(false)} />
            <motion.aside
              className="absolute inset-y-0 left-0 w-72 border-r border-line bg-surface"
              initial={{ x: -288 }}
              animate={{ x: 0 }}
              exit={{ x: -288 }}
              transition={{ type: 'tween', duration: 0.2 }}
            >
              <button onClick={() => setMobileOpen(false)} className="absolute right-3 top-3.5 rounded p-1.5 text-ink-3 hover:bg-white" aria-label="Close navigation">
                <X size={16} />
              </button>
              <Sidebar onNavigate={() => setMobileOpen(false)} />
            </motion.aside>
          </div>
        )}
      </AnimatePresence>

      <main className="lg:pl-60">
        <div className="mx-auto max-w-[1280px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          <Suspense fallback={<div className="flex justify-center py-24"><Spinner size={20} /></div>}>
            <Outlet />
          </Suspense>
        </div>
      </main>
    </div>
  );
}
