import { useQueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { onSessionChange, refreshSession, setAccessToken, type SessionPayload } from '@/api/client';
import { authApi } from '@/api/endpoints';
import type { User } from '@/api/types';

type Status = 'loading' | 'authenticated' | 'anonymous';

interface AuthContextValue {
  status: Status;
  user: User | null;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>('loading');
  const [user, setUser] = useState<User | null>(null);
  const queryClient = useQueryClient();

  const apply = useCallback((session: SessionPayload | null) => {
    setAccessToken(session?.accessToken ?? null);
    setUser(session?.user ?? null);
    setStatus(session ? 'authenticated' : 'anonymous');
  }, []);

  useEffect(() => {
    const off = onSessionChange((session) => {
      if (!session) queryClient.clear();
      apply(session);
    });
    // Restore a session from the refresh cookie on first load.
    void refreshSession().then(apply);
    return () => {
      off();
    };
  }, [apply, queryClient]);

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      user,
      login: async (email, password) => apply(await authApi.login({ email, password })),
      register: async (name, email, password) => apply(await authApi.register({ name, email, password })),
      logout: async () => {
        try {
          await authApi.logout();
        } finally {
          queryClient.clear();
          apply(null);
        }
      },
    }),
    [status, user, apply, queryClient],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
