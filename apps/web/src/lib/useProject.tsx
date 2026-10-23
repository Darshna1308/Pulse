import { useQuery } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { projectsApi } from '@/api/endpoints';
import type { Project } from '@/api/types';

const STORAGE_KEY = 'pulse.currentProject';

interface ProjectContextValue {
  projects: Project[];
  project: Project | null;
  isLoading: boolean;
  error: unknown;
  select: (id: string) => void;
}

const ProjectContext = createContext<ProjectContextValue | null>(null);

function readStored(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function ProjectProvider({ children }: { children: ReactNode }) {
  const query = useQuery({ queryKey: ['projects'], queryFn: projectsApi.list });
  const [selected, setSelected] = useState<string | null>(readStored);

  const projects = useMemo(() => query.data ?? [], [query.data]);
  const project = projects.find((p) => p.id === selected) ?? projects[0] ?? null;

  useEffect(() => {
    if (project && project.id !== selected) setSelected(project.id);
  }, [project, selected]);

  const select = useCallback((id: string) => {
    setSelected(id);
    try {
      localStorage.setItem(STORAGE_KEY, id);
    } catch {
      /* storage unavailable: selection lasts for this tab only */
    }
  }, []);

  const value = useMemo(
    () => ({ projects, project, isLoading: query.isLoading, error: query.error, select }),
    [projects, project, query.isLoading, query.error, select],
  );
  return <ProjectContext.Provider value={value}>{children}</ProjectContext.Provider>;
}

export function useProject() {
  const ctx = useContext(ProjectContext);
  if (!ctx) throw new Error('useProject must be used inside ProjectProvider');
  return ctx;
}
