import { useMutation, useQueryClient } from '@tanstack/react-query';
import { FolderKanban, Pencil, Plus, Sparkles, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ApiError } from '@/api/client';
import { projectsApi } from '@/api/endpoints';
import type { Project } from '@/api/types';
import { DemoButton } from '@/components/DemoButton';
import { PageHeader } from '@/components/layout/PageHeader';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Field, Input, Select, Textarea } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { EmptyState, ErrorState, InlineError, Skeleton } from '@/components/ui/States';
import { useToast } from '@/components/ui/Toast';
import { fmtNumber, fmtRelative } from '@/lib/format';
import { useProject } from '@/lib/useProject';

function ProjectForm({ initial, open, onClose }: { initial?: Project; open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const notify = useToast();
  const { select } = useProject();
  const [form, setForm] = useState({ name: '', description: '', environment: 'production' as Project['environment'] });
  useEffect(() => {
    if (open) setForm({ name: initial?.name ?? '', description: initial?.description ?? '', environment: initial?.environment ?? 'production' });
  }, [open, initial]);

  const mutation = useMutation({
    mutationFn: () => (initial ? projectsApi.update(initial.id, form) : projectsApi.create(form)),
    onSuccess: (p) => {
      void qc.invalidateQueries({ queryKey: ['projects'] });
      if (!initial) select(p.id);
      notify(initial ? 'Project updated.' : `Project “${p.name}” created.`);
      mutation.reset();
      onClose();
    },
  });
  const errors = mutation.error instanceof ApiError ? mutation.error.fieldErrors() : {};

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={initial ? 'Edit project' : 'Create project'}
      description={initial ? undefined : 'One project per API or service. Keys, events and alerts are scoped to it.'}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={mutation.isPending} disabled={!form.name.trim()} onClick={() => mutation.mutate()}>
            {initial ? 'Save changes' : 'Create project'}
          </Button>
        </>
      }
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (form.name.trim()) mutation.mutate();
        }}
      >
        <Field label="Name" error={errors.name}>
          {(p) => <Input {...p} value={form.name} maxLength={80} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Checkout API" />}
        </Field>
        <Field label="Environment">
          {(p) => (
            <Select {...p} value={form.environment} onChange={(e) => setForm({ ...form, environment: e.target.value as Project['environment'] })}>
              <option value="production">Production</option>
              <option value="staging">Staging</option>
              <option value="development">Development</option>
            </Select>
          )}
        </Field>
        <Field label="Description (optional)" error={errors.description}>
          {(p) => <Textarea {...p} value={form.description} maxLength={500} onChange={(e) => setForm({ ...form, description: e.target.value })} />}
        </Field>
        {!Object.keys(errors).length && <InlineError error={mutation.error} />}
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}

function DeleteProject({ project, onClose }: { project: Project | null; onClose: () => void }) {
  const qc = useQueryClient();
  const notify = useToast();
  const [confirm, setConfirm] = useState('');
  useEffect(() => setConfirm(''), [project]);
  const mutation = useMutation({
    mutationFn: () => projectsApi.remove(project!.id),
    onSuccess: () => {
      void qc.invalidateQueries();
      notify(`Deleted “${project?.name}”.`);
      onClose();
    },
  });
  return (
    <Modal
      open={!!project}
      onClose={onClose}
      title={`Delete “${project?.name}”?`}
      description="This permanently deletes the project with all of its events, alerts and API keys."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="danger" disabled={confirm !== project?.name} loading={mutation.isPending} onClick={() => mutation.mutate()}>
            Delete project
          </Button>
        </>
      }
    >
      <Field label={`Type “${project?.name}” to confirm`}>{(p) => <Input {...p} value={confirm} onChange={(e) => setConfirm(e.target.value)} />}</Field>
      <div className="mt-3">
        <InlineError error={mutation.error} />
      </div>
    </Modal>
  );
}

export default function ProjectsPage() {
  const { projects, project: current, isLoading, error, select } = useProject();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [editing, setEditing] = useState<Project | undefined>();
  const [formOpen, setFormOpen] = useState(params.get('new') === '1');
  const [deleting, setDeleting] = useState<Project | null>(null);

  return (
    <>
      <PageHeader
        title="Projects"
        description="Each project has its own keys, events, alerts and analytics. Only you can see your projects."
        actions={
          <>
            <DemoButton icon={<Sparkles size={15} aria-hidden />} autoOpen={params.get('demo') === '1'} />
            <Button
              icon={<Plus size={15} aria-hidden />}
              onClick={() => {
                setEditing(undefined);
                setFormOpen(true);
              }}
            >
              New project
            </Button>
          </>
        }
      />
      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2">
          <Skeleton className="h-36" />
          <Skeleton className="h-36" />
        </div>
      ) : error ? (
        <Card>
          <ErrorState error={error} />
        </Card>
      ) : !projects.length ? (
        <Card>
          <EmptyState
            icon={<FolderKanban size={20} aria-hidden />}
            title="No projects yet"
            description="Create a project for your API to get an ingestion key."
            action={
              <Button icon={<Plus size={15} aria-hidden />} onClick={() => setFormOpen(true)}>
                New project
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {projects.map((p) => (
            <Card key={p.id} className={p.id === current?.id ? 'ring-1 ring-cyan-500/40' : undefined}>
              <div className="flex items-start justify-between gap-3 px-5 pt-5">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="truncate text-[15px] font-semibold text-ink">{p.name}</h2>
                    {p.isDemo ? <Badge tone="violet">Simulated data</Badge> : <Badge>{p.environment}</Badge>}
                    {p.id === current?.id && <Badge tone="info">Current</Badge>}
                  </div>
                  <p className="mt-1 line-clamp-2 text-xs text-ink-3">{p.description || 'No description.'}</p>
                </div>
                <div className="flex shrink-0 gap-1">
                  <button
                    aria-label={`Edit ${p.name}`}
                    onClick={() => {
                      setEditing(p);
                      setFormOpen(true);
                    }}
                    className="rounded p-1.5 text-ink-3 hover:bg-surface hover:text-ink"
                  >
                    <Pencil size={14} />
                  </button>
                  <button aria-label={`Delete ${p.name}`} onClick={() => setDeleting(p)} className="rounded p-1.5 text-ink-3 hover:bg-critical-soft hover:text-critical">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
              <dl className="mt-4 grid grid-cols-3 border-t border-line text-center">
                <div className="px-3 py-3">
                  <dt className="text-2xs text-ink-3">Events</dt>
                  <dd className="mt-0.5 font-display text-lg font-semibold tabular">{fmtNumber(p.stats?.events ?? 0)}</dd>
                </div>
                <div className="border-x border-line px-3 py-3">
                  <dt className="text-2xs text-ink-3">Open alerts</dt>
                  <dd className="mt-0.5 font-display text-lg font-semibold tabular">{fmtNumber(p.stats?.unresolvedAlerts ?? 0)}</dd>
                </div>
                <div className="px-3 py-3">
                  <dt className="text-2xs text-ink-3">Last event</dt>
                  <dd className="mt-1 text-xs font-medium text-ink-2">{fmtRelative(p.stats?.lastEventAt)}</dd>
                </div>
              </dl>
              <div className="flex justify-end gap-2 border-t border-line px-4 py-2.5">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    select(p.id);
                    navigate('/app/keys');
                  }}
                >
                  Keys
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    select(p.id);
                    navigate('/app');
                  }}
                >
                  Open dashboard
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
      <ProjectForm
        initial={editing}
        open={formOpen}
        onClose={() => {
          setFormOpen(false);
          if (params.get('new')) setParams({}, { replace: true });
        }}
      />
      <DeleteProject project={deleting} onClose={() => setDeleting(null)} />
    </>
  );
}
