import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '@/auth/AuthProvider';
import { ProtectedRoute, PublicOnlyRoute } from '@/auth/ProtectedRoute';
import LoginPage from '@/pages/public/LoginPage';
import RegisterPage from '@/pages/public/RegisterPage';

function Where() {
  const loc = useLocation();
  return <div data-testid="where">{loc.pathname + loc.search}</div>;
}

function renderAt(path: string, routes: React.ReactNode) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={[path]}>
        <AuthProvider>
          <Routes>{routes}</Routes>
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

afterEach(() => vi.unstubAllGlobals());

describe('auth UI', () => {
  it('redirects anonymous users from the dashboard to login with a next parameter', async () => {
    // No pulse_csrf cookie, so the session restore resolves to anonymous without a network call.
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    renderAt(
      '/app/alerts?status=open',
      <>
        <Route element={<ProtectedRoute />}>
          <Route path="/app/alerts" element={<div>secret</div>} />
        </Route>
        <Route path="/login" element={<Where />} />
      </>,
    );
    expect(await screen.findByTestId('where')).toHaveTextContent('/login?next=%2Fapp%2Falerts%3Fstatus%3Dopen');
    expect(screen.queryByText('secret')).not.toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('validates the registration form before calling the API', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    renderAt('/register', <Route path="/register" element={<RegisterPage />} />);
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText('Name'), 'Ada');
    await user.type(screen.getByLabelText('Work email'), 'ada@example');
    await user.type(screen.getByLabelText('Password'), 'short1');
    await user.click(screen.getByRole('button', { name: /create account/i }));
    expect(screen.getByText('Enter a valid email address')).toBeInTheDocument();
    expect(screen.getByText('Use at least 10 characters')).toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('shows a generic message for wrong credentials and clears the password', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ error: { code: 'invalid_credentials', message: 'Invalid email or password' } }), { status: 401 })),
    );
    renderAt('/login', <Route path="/login" element={<LoginPage />} />);
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText('Email'), 'ada@example.com');
    await user.type(screen.getByLabelText('Password'), 'wrong-password-1');
    await user.click(screen.getByRole('button', { name: /sign in/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Email or password is incorrect.');
    expect(screen.getByLabelText('Password')).toHaveValue('');
  });

  it('sends new users with ?intent=demo to the demo flow after sign-up', async () => {
    const session = { user: { id: 'u1', email: 'ada@example.com', name: 'Ada' }, accessToken: 't', accessTokenExpiresIn: 900, csrfToken: 'c' };
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ data: session }), { status: 201 })));
    renderAt(
      '/register?intent=demo',
      <>
        <Route element={<PublicOnlyRoute />}>
          <Route path="/register" element={<RegisterPage />} />
        </Route>
        <Route path="/app/*" element={<Where />} />
      </>,
    );
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText('Name'), 'Ada');
    await user.type(screen.getByLabelText('Work email'), 'ada@example.com');
    await user.type(screen.getByLabelText('Password'), 'correct horse 9');
    await user.click(screen.getByRole('button', { name: /create account/i }));
    expect(await screen.findByTestId('where')).toHaveTextContent('/app/projects?demo=1');
  });
});
