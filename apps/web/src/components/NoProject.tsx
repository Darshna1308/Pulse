import { FolderPlus, Sparkles } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useProject } from '@/lib/useProject';
import { Button } from './ui/Button';
import { Card } from './ui/Card';
import { EmptyState, ErrorState, Skeleton } from './ui/States';
import { DemoButton } from './DemoButton';

/** Renders children only when a project is selected; otherwise loading, error or onboarding. */
export function RequireProject({ children }: { children: (projectId: string) => React.ReactNode }) {
  const { project, isLoading, error } = useProject();
  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }
  if (error) return <Card><ErrorState error={error} onRetry={() => window.location.reload()} /></Card>;
  if (!project) {
    return (
      <Card>
        <EmptyState
          icon={<FolderPlus size={20} aria-hidden />}
          title="Create your first project"
          description="A project groups the API traffic of one service. Create one for your API, or explore Pulse with a separate demo project filled with clearly labelled simulated traffic."
          action={
            <>
              <Link to="/app/projects?new=1">
                <Button icon={<FolderPlus size={15} aria-hidden />}>Create project</Button>
              </Link>
              <DemoButton variant="secondary" icon={<Sparkles size={15} aria-hidden />} />
            </>
          }
        />
      </Card>
    );
  }
  return <>{children(project.id)}</>;
}
