import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, KeyRound, Plus } from 'lucide-react';
import { useState } from 'react';
import { keysApi } from '@/api/endpoints';
import type { ApiKey } from '@/api/types';
import { IngestSnippet } from '@/components/IngestSnippet';
import { PageHeader } from '@/components/layout/PageHeader';
import { RequireProject } from '@/components/NoProject';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { Field, Input } from '@/components/ui/Field';
import { CopyButton } from '@/components/ui/Misc';
import { Modal } from '@/components/ui/Modal';
import { EmptyState, ErrorState, InlineError, Skeleton } from '@/components/ui/States';
import { useToast } from '@/components/ui/Toast';
import { ApiError } from '@/api/client';
import { fmtDateTime, fmtRelative } from '@/lib/format';
import { useProject } from '@/lib/useProject';

function CreateKeyModal({ projectId, open, onClose }: { projectId: string; open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [created, setCreated] = useState<{ key: string; apiKey: ApiKey } | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);
  const mutation = useMutation({
    mutationFn: () => keysApi.create(projectId, name.trim()),
    onSuccess: (res) => {
      setCreated(res);
      void qc.invalidateQueries({ queryKey: ['keys', projectId] });
    },
  });
  const close = () => {
    setName('');
    setCreated(null);
    setAcknowledged(false);
    mutation.reset();
    onClose();
  };
  const fieldError = mutation.error instanceof ApiError ? mutation.error.fieldErrors().name : undefined;

  if (created) {
    return (
      <Modal
        open={open}
        onClose={() => acknowledged && close()}
        dismissible={acknowledged}
        title="Copy your new API key"
        description="This is the only time the full key is shown. Pulse stores only a keyed hash of it."
        footer={
          <Button onClick={close} disabled={!acknowledged}>
            Done
          </Button>
        }
      >
        <div className="flex items-center gap-2 rounded-md border border-line bg-surface p-2">
          <code className="min-w-0 flex-1 select-all break-all px-1 font-mono text-xs text-ink">{created.key}</code>
          <CopyButton value={created.key} />
        </div>
        <div className="mt-3 flex items-start gap-2 rounded-md bg-warn-soft px-3 py-2 text-xs text-warn">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" aria-hidden />
          Store it in your secret manager. Never put it in URLs, client-side code or logs.
        </div>
        <label className="mt-4 flex items-center gap-2 text-[13px] text-ink-2">
          <input type="checkbox" checked={acknowledged} onChange={(e) => setAcknowledged(e.target.checked)} className="h-4 w-4 rounded border-line-strong accent-cyan-600" />
          I have stored this key somewhere safe
        </label>
      </Modal>
    );
  }

  return (
    <Modal
      open={open}
      onClose={close}
      title="Create API key"
      description="Keys can ingest events into this project only (scope events:write)."
      footer={
        <>
          <Button variant="ghost" onClick={close}>
            Cancel
          </Button>
          <Button onClick={() => mutation.mutate()} loading={mutation.isPending} disabled={!name.trim()}>
            Create key
          </Button>
        </>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim()) mutation.mutate();
        }}
      >
        <Field label="Key name" hint="Describe where it will be used, e.g. “API gateway – production”." error={fieldError}>
          {(p) => <Input {...p} value={name} maxLength={80} onChange={(e) => setName(e.target.value)} placeholder="API gateway – production" />}
        </Field>
      </form>
      {!fieldError && <div className="mt-3"><InlineError error={mutation.error} /></div>}
    </Modal>
  );
}

function Keys({ projectId }: { projectId: string }) {
  const { project } = useProject();
  const qc = useQueryClient();
  const notify = useToast();
  const [creating, setCreating] = useState(false);
  const [revoking, setRevoking] = useState<ApiKey | null>(null);
  const query = useQuery({ queryKey: ['keys', projectId], queryFn: () => keysApi.list(projectId) });
  const revoke = useMutation({
    mutationFn: (k: ApiKey) => keysApi.revoke(projectId, k.id),
    onSuccess: (k) => {
      void qc.invalidateQueries({ queryKey: ['keys', projectId] });
      setRevoking(null);
      notify(`Revoked “${k.name}”. Requests using it are now rejected.`);
    },
  });

  return (
    <>
      <PageHeader
        title="API keys"
        description={`Project-scoped keys for sending request metadata to ${project?.name ?? 'this project'}.`}
        actions={
          <Button onClick={() => setCreating(true)} icon={<Plus size={15} aria-hidden />}>
            Create key
          </Button>
        }
      />
      <div className="grid gap-5 xl:grid-cols-5">
        <Card className="xl:col-span-3">
          <CardHeader title="Keys" description="Full keys are never shown again after creation." />
          {query.isLoading ? (
            <div className="space-y-2 p-4">
              <Skeleton className="h-10" />
              <Skeleton className="h-10" />
            </div>
          ) : query.error ? (
            <ErrorState error={query.error} onRetry={() => void query.refetch()} />
          ) : !query.data?.length ? (
            <EmptyState
              icon={<KeyRound size={20} aria-hidden />}
              title="No API keys yet"
              description="Create a key, then send events from your API or gateway."
              action={
                <Button onClick={() => setCreating(true)} icon={<Plus size={15} aria-hidden />}>
                  Create key
                </Button>
              }
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-left text-[13px]">
                <thead>
                  <tr className="border-b border-line text-2xs uppercase tracking-wider text-ink-3">
                    <th className="px-5 py-2.5 font-medium">Name</th>
                    <th className="px-3 py-2.5 font-medium">Key</th>
                    <th className="px-3 py-2.5 font-medium">Created</th>
                    <th className="px-3 py-2.5 font-medium">Last used</th>
                    <th className="px-5 py-2.5 text-right font-medium">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {query.data.map((k) => (
                    <tr key={k.id} className={k.status === 'revoked' ? 'text-ink-3' : undefined}>
                      <td className="px-5 py-3 font-medium">{k.name}</td>
                      <td className="px-3 py-3 font-mono text-xs">{k.prefix}••••</td>
                      <td className="px-3 py-3 text-ink-2">{fmtDateTime(k.createdAt)}</td>
                      <td className="px-3 py-3 text-ink-2">{fmtRelative(k.lastUsedAt)}</td>
                      <td className="px-5 py-3 text-right">
                        {k.status === 'revoked' ? (
                          <Badge>Revoked {fmtRelative(k.revokedAt)}</Badge>
                        ) : (
                          <span className="inline-flex items-center gap-2">
                            <Badge tone="ok">Active</Badge>
                            <Button size="sm" variant="danger" onClick={() => (revoke.reset(), setRevoking(k))}>
                              Revoke
                            </Button>
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
        <Card className="xl:col-span-2">
          <CardHeader title="Send events" description="POST metadata only: route template, status, timing, sizes and a pseudonymous client id." />
          <div className="space-y-3 p-5">
            <IngestSnippet />
            <ul className="space-y-1 text-xs text-ink-3">
              <li>• Batch up to 100 events with <code className="font-mono text-ink-2">{'{"events": [...]}'}</code>.</li>
              <li>• Set <code className="font-mono text-ink-2">id</code> to make retries idempotent.</li>
              <li>• Unknown fields (headers, bodies, tokens) are rejected, by design.</li>
            </ul>
          </div>
        </Card>
      </div>
      <CreateKeyModal projectId={projectId} open={creating} onClose={() => setCreating(false)} />
      <Modal
        open={!!revoking}
        onClose={() => setRevoking(null)}
        title={`Revoke “${revoking?.name}”?`}
        description="Ingestion requests using this key will be rejected immediately. This cannot be undone; create a new key to replace it."
        footer={
          <>
            <Button variant="ghost" onClick={() => setRevoking(null)}>
              Cancel
            </Button>
            <Button variant="danger" loading={revoke.isPending} onClick={() => revoking && revoke.mutate(revoking)} data-autofocus>
              Revoke key
            </Button>
          </>
        }
      >
        <InlineError error={revoke.error} />
      </Modal>
    </>
  );
}

export default function KeysPage() {
  return <RequireProject>{(id) => <Keys key={id} projectId={id} />}</RequireProject>;
}
