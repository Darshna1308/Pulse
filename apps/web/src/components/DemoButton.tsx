import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { ApiError } from '@/api/client';
import { projectsApi } from '@/api/endpoints';
import { useProject } from '@/lib/useProject';
import { Button, type ButtonProps } from './ui/Button';
import { Modal } from './ui/Modal';
import { errorMessage } from './ui/States';
import { useToast } from './ui/Toast';

/** Creates a separate demo project with simulated traffic scored by the real model. */
export function DemoButton({
  variant = 'secondary',
  icon,
  label = 'Generate demo project',
  autoOpen = false,
}: {
  variant?: ButtonProps['variant'];
  icon?: ReactNode;
  label?: string;
  /** Open the confirmation dialog on mount (used after sign-up with ?intent=demo). */
  autoOpen?: boolean;
}) {
  const [open, setOpen] = useState(autoOpen);
  const qc = useQueryClient();
  const { projects, select } = useProject();
  const notify = useToast();
  const existing = projects.find((p) => p.isDemo);

  const mutation = useMutation({
    mutationFn: projectsApi.createDemo,
    onSuccess: async (res) => {
      await qc.invalidateQueries({ queryKey: ['projects'] });
      select(res.project.id);
      setOpen(false);
      notify(`Demo project ready: ${res.events.toLocaleString()} simulated events scored, ${res.alertsCreated} alerts raised.`);
    },
  });

  if (existing) {
    return (
      <Button variant={variant} icon={icon} onClick={() => select(existing.id)}>
        Open demo project
      </Button>
    );
  }

  const err = mutation.error;
  return (
    <>
      <Button variant={variant} icon={icon} onClick={() => setOpen(true)}>
        {label}
      </Button>
      <Modal
        open={open}
        onClose={() => !mutation.isPending && setOpen(false)}
        dismissible={!mutation.isPending}
        title="Generate a demo project"
        description="Pulse creates a new project named “Demo · Simulated traffic” and fills it with four hours of synthetic API traffic that includes injected incidents. Your existing projects are not touched."
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={mutation.isPending}>
              Cancel
            </Button>
            <Button onClick={() => mutation.mutate()} loading={mutation.isPending} data-autofocus>
              {mutation.isPending ? 'Scoring events…' : 'Generate'}
            </Button>
          </>
        }
      >
        <ul className="list-disc space-y-1 pl-5 text-sm text-ink-2">
          <li>Every event is sent through the real pipeline: context features, Isolation Forest scoring, alert grouping.</li>
          <li>The project and its alerts are labelled as simulated everywhere in the app.</li>
          <li>This takes roughly 10–30 seconds.</li>
        </ul>
        {err != null && (
          <p role="alert" className="mt-3 rounded-md bg-critical-soft px-3 py-2 text-xs text-critical">
            {err instanceof ApiError && err.code === 'demo_disabled' ? 'Demo data is disabled on this deployment.' : errorMessage(err)}
          </p>
        )}
      </Modal>
    </>
  );
}
