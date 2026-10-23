import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { lazy, Suspense } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { ApiError } from '@/api/client';
import { AuthProvider } from '@/auth/AuthProvider';
import { ProtectedRoute, PublicOnlyRoute } from '@/auth/ProtectedRoute';
import { AppLayout } from '@/components/layout/AppLayout';
import { FullPageSpinner } from '@/components/ui/Spinner';
import { ToastProvider } from '@/components/ui/Toast';
import { ProjectProvider } from '@/lib/useProject';

const LandingPage = lazy(() => import('@/pages/public/LandingPage'));
const LoginPage = lazy(() => import('@/pages/public/LoginPage'));
const RegisterPage = lazy(() => import('@/pages/public/RegisterPage'));
const NotFoundPage = lazy(() => import('@/pages/public/NotFoundPage'));
const OverviewPage = lazy(() => import('@/pages/app/OverviewPage'));
const EventsPage = lazy(() => import('@/pages/app/EventsPage'));
const AlertsPage = lazy(() => import('@/pages/app/AlertsPage'));
const AlertDetailPage = lazy(() => import('@/pages/app/AlertDetailPage'));
const AnalyticsPage = lazy(() => import('@/pages/app/AnalyticsPage'));
const KeysPage = lazy(() => import('@/pages/app/KeysPage'));
const ProjectsPage = lazy(() => import('@/pages/app/ProjectsPage'));
const SettingsPage = lazy(() => import('@/pages/app/SettingsPage'));

export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 15_000,
        refetchOnWindowFocus: false,
        // Client errors (403/404/validation) will not succeed on retry.
        retry: (count, error) => !(error instanceof ApiError && error.status < 500) && count < 2,
      },
    },
  });
}

const queryClient = createQueryClient();

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <BrowserRouter>
          <AuthProvider>
            <Suspense fallback={<FullPageSpinner label="Loading" dark />}>
              <Routes>
                <Route path="/" element={<LandingPage />} />
                <Route element={<PublicOnlyRoute />}>
                  <Route path="/login" element={<LoginPage />} />
                  <Route path="/register" element={<RegisterPage />} />
                </Route>
                <Route element={<ProtectedRoute />}>
                  <Route
                    path="/app"
                    element={
                      <ProjectProvider>
                        <AppLayout />
                      </ProjectProvider>
                    }
                  >
                    <Route index element={<OverviewPage />} />
                    <Route path="events" element={<EventsPage />} />
                    <Route path="alerts" element={<AlertsPage />} />
                    <Route path="alerts/:alertId" element={<AlertDetailPage />} />
                    <Route path="analytics" element={<AnalyticsPage />} />
                    <Route path="keys" element={<KeysPage />} />
                    <Route path="projects" element={<ProjectsPage />} />
                    <Route path="settings" element={<SettingsPage />} />
                  </Route>
                </Route>
                <Route path="*" element={<NotFoundPage />} />
              </Routes>
            </Suspense>
          </AuthProvider>
        </BrowserRouter>
      </ToastProvider>
    </QueryClientProvider>
  );
}
