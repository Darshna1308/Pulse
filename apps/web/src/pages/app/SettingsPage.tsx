import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { LogOut, Monitor, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { ApiError } from '@/api/client';
import { authApi } from '@/api/endpoints';
import { useAuth } from '@/auth/AuthProvider';
import { PageHeader } from '@/components/layout/PageHeader';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { Field, Input } from '@/components/ui/Field';
import { ErrorState, InlineError, Skeleton } from '@/components/ui/States';
import { useToast } from '@/components/ui/Toast';
import { describeUserAgent, fmtDateTime, fmtRelative } from '@/lib/format';

function PasswordForm() {
  const notify = useToast();
  const [form, setForm] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const [localError, setLocalError] = useState<string | null>(null);
  const qc = useQueryClient();
  const mutation = useMutation({
    mutationFn: () => authApi.changePassword({ currentPassword: form.currentPassword, newPassword: form.newPassword }),
    onSuccess: () => {
      setForm({ currentPassword: '', newPassword: '', confirm: '' });
      void qc.invalidateQueries({ queryKey: ['sessions'] });
      notify('Password changed. Your other sessions were signed out.');
    },
  });
  const fieldErrors = mutation.error instanceof ApiError ? mutation.error.fieldErrors() : {};
  return (
    <form
      className="space-y-4 px-5 py-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (form.newPassword !== form.confirm) return setLocalError('The new passwords do not match.');
        setLocalError(null);
        mutation.mutate();
      }}
    >
      <Field label="Current password" error={mutation.error instanceof ApiError && mutation.error.code === 'invalid_credentials' ? 'Current password is incorrect.' : undefined}>
        {(p) => <Input {...p} type="password" autoComplete="current-password" value={form.currentPassword} onChange={(e) => setForm({ ...form, currentPassword: e.target.value })} required />}
      </Field>
      <Field label="New password" hint="At least 10 characters, with a letter and a number." error={fieldErrors.newPassword}>
        {(p) => <Input {...p} type="password" autoComplete="new-password" value={form.newPassword} onChange={(e) => setForm({ ...form, newPassword: e.target.value })} required />}
      </Field>
      <Field label="Confirm new password" error={localError ?? undefined}>
        {(p) => <Input {...p} type="password" autoComplete="new-password" value={form.confirm} onChange={(e) => setForm({ ...form, confirm: e.target.value })} required />}
      </Field>
      {mutation.error instanceof ApiError && !['invalid_credentials', 'validation_error'].includes(mutation.error.code) && <InlineError error={mutation.error} />}
      <Button type="submit" loading={mutation.isPending}>
        Update password
      </Button>
    </form>
  );
}

export default function SettingsPage() {
  const { user, logout } = useAuth();
  const qc = useQueryClient();
  const notify = useToast();
  const sessions = useQuery({ queryKey: ['sessions'], queryFn: authApi.sessions });
  const revoke = useMutation({
    mutationFn: authApi.revokeSession,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['sessions'] });
      notify('Session signed out.');
    },
  });
  const revokeOthers = useMutation({
    mutationFn: authApi.revokeOthers,
    onSuccess: (r) => {
      void qc.invalidateQueries({ queryKey: ['sessions'] });
      notify(r.revoked ? `Signed out ${r.revoked} other session${r.revoked > 1 ? 's' : ''}.` : 'No other sessions were active.');
    },
  });
  const others = sessions.data?.filter((s) => !s.current).length ?? 0;

  return (
    <>
      <PageHeader title="Settings" description="Your account, password and active sessions." />
      <div className="grid gap-5 lg:grid-cols-5">
        <div className="space-y-5 lg:col-span-2">
          <Card>
            <CardHeader title="Account" />
            <dl className="divide-y divide-line text-[13px]">
              <div className="flex justify-between px-5 py-3">
                <dt className="text-ink-3">Name</dt>
                <dd className="font-medium">{user?.name}</dd>
              </div>
              <div className="flex justify-between px-5 py-3">
                <dt className="text-ink-3">Email</dt>
                <dd className="font-medium">{user?.email}</dd>
              </div>
            </dl>
            <p className="border-t border-line px-5 py-3 text-xs text-ink-3">Editing your name or email is not available yet.</p>
          </Card>
          <Card>
            <CardHeader title="Change password" description="Changing it signs out every other session." />
            <PasswordForm />
          </Card>
        </div>
        <Card className="lg:col-span-3">
          <CardHeader
            title={
              <span className="flex items-center gap-2">
                <ShieldCheck size={15} className="text-ink-3" aria-hidden /> Active sessions
              </span>
            }
            description="Each sign-in is a server-side session with a rotating refresh token. Revoking one takes effect immediately."
            action={
              <Button size="sm" variant="secondary" disabled={!others} loading={revokeOthers.isPending} onClick={() => revokeOthers.mutate()}>
                Sign out other sessions
              </Button>
            }
          />
          {sessions.isLoading ? (
            <div className="space-y-2 p-4">
              <Skeleton className="h-12" />
              <Skeleton className="h-12" />
            </div>
          ) : sessions.error ? (
            <ErrorState error={sessions.error} onRetry={() => void sessions.refetch()} />
          ) : (
            <ul className="divide-y divide-line">
              {sessions.data?.map((s) => (
                <li key={s.id} className="flex items-center gap-3 px-5 py-3.5">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-surface text-ink-3">
                    <Monitor size={16} aria-hidden />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-[13px] font-medium">{describeUserAgent(s.userAgent)}</span>
                      {s.current && <Badge tone="ok">This device</Badge>}
                    </div>
                    <div className="mt-0.5 text-xs text-ink-3">
                      {s.ipAddress ?? 'unknown IP'} · signed in {fmtDateTime(s.createdAt)} · active {fmtRelative(s.lastUsedAt)}
                    </div>
                  </div>
                  {s.current ? (
                    <Button size="sm" variant="secondary" icon={<LogOut size={14} aria-hidden />} onClick={() => void logout()}>
                      Sign out
                    </Button>
                  ) : (
                    <Button size="sm" variant="danger" loading={revoke.isPending && revoke.variables === s.id} onClick={() => revoke.mutate(s.id)}>
                      Revoke
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
