import { ArrowRight } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ApiError } from '@/api/client';
import { useAuth } from '@/auth/AuthProvider';
import { Button } from '@/components/ui/Button';
import { DarkInput, Field } from '@/components/ui/Field';
import { safeNext, validateEmail } from '@/lib/validation';
import { AuthShell, FormError } from './AuthShell';

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<{ email?: string; password?: string; form?: string }>({});
  const [pending, setPending] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const next = { email: validateEmail(email), password: password ? undefined : 'Password is required' };
    setErrors(next);
    if (next.email || next.password) return;
    setPending(true);
    try {
      await login(email.trim(), password);
      navigate(safeNext(params.get('next')), { replace: true });
    } catch (err) {
      setPassword('');
      if (err instanceof ApiError && err.status === 401) setErrors({ form: 'Email or password is incorrect.' });
      else if (err instanceof ApiError && err.status === 429) setErrors({ form: 'Too many sign-in attempts. Wait a few minutes and try again.' });
      else setErrors({ form: 'Sign-in failed. Check your connection and try again.' });
    } finally {
      setPending(false);
    }
  }

  return (
    <AuthShell
      title="Sign in"
      subtitle="Welcome back. Pick up where your alerts left off."
      footer={
        <>
          New to Pulse?{' '}
          <Link to={`/register${params.get('next') ? `?next=${encodeURIComponent(params.get('next')!)}` : ''}`} className="font-medium text-cyan-300 hover:text-cyan-200">
            Create an account
          </Link>
        </>
      }
    >
      <FormError message={errors.form} />
      <form onSubmit={onSubmit} noValidate className="space-y-5">
        <Field label="Email" error={errors.email} dark>
          {(p) => <DarkInput {...p} type="email" autoComplete="email" autoFocus value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" />}
        </Field>
        <Field label="Password" error={errors.password} dark>
          {(p) => <DarkInput {...p} type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />}
        </Field>
        <Button type="submit" variant="accent" size="lg" className="w-full" loading={pending}>
          Sign in <ArrowRight size={16} aria-hidden />
        </Button>
      </form>
    </AuthShell>
  );
}
