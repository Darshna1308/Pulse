import { ArrowRight } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ApiError } from '@/api/client';
import { useAuth } from '@/auth/AuthProvider';
import { Button } from '@/components/ui/Button';
import { DarkInput, Field } from '@/components/ui/Field';
import { cn } from '@/lib/cn';
import { passwordStrength, safeNext, validateEmail, validateName, validatePassword } from '@/lib/validation';
import { AuthShell, FormError } from './AuthShell';

type Errors = { name?: string; email?: string; password?: string; form?: string };

const STRENGTH = ['Too weak', 'Acceptable', 'Good', 'Strong'] as const;

export default function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const wantsDemo = params.get('intent') === 'demo';
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const [pending, setPending] = useState(false);
  const strength = passwordStrength(password);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const next: Errors = { name: validateName(name), email: validateEmail(email), password: validatePassword(password) };
    setErrors(next);
    if (next.name || next.email || next.password) return;
    setPending(true);
    try {
      await register(name.trim(), email.trim(), password);
      navigate(wantsDemo ? '/app/projects?demo=1' : safeNext(params.get('next'), '/app/projects?new=1'), { replace: true });
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) setErrors({ email: 'An account with this email already exists.' });
      else if (err instanceof ApiError && err.code === 'validation_error') setErrors(err.fieldErrors());
      else if (err instanceof ApiError && err.status === 429) setErrors({ form: 'Too many sign-ups from this network. Try again later.' });
      else setErrors({ form: 'Registration failed. Check your connection and try again.' });
    } finally {
      setPending(false);
    }
  }

  return (
    <AuthShell
      title="Create your account"
      subtitle={wantsDemo ? 'After signing up you can generate a demo project with simulated traffic.' : 'Start monitoring an API in a few minutes.'}
      footer={
        <>
          Already have an account?{' '}
          <Link to="/login" className="font-medium text-cyan-300 hover:text-cyan-200">
            Sign in
          </Link>
        </>
      }
    >
      <FormError message={errors.form} />
      <form onSubmit={onSubmit} noValidate className="space-y-5">
        <Field label="Name" error={errors.name} dark>
          {(p) => <DarkInput {...p} autoComplete="name" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Ada Lovelace" />}
        </Field>
        <Field label="Work email" error={errors.email} dark>
          {(p) => <DarkInput {...p} type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" />}
        </Field>
        <Field label="Password" error={errors.password} hint="At least 10 characters with a letter and a number." dark>
          {(p) => <DarkInput {...p} type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />}
        </Field>
        {password && (
          <div className="-mt-2 flex items-center gap-3" aria-live="polite">
            <div className="flex flex-1 gap-1" aria-hidden>
              {[1, 2, 3].map((i) => (
                <span
                  key={i}
                  className={cn('h-1 flex-1 rounded-full', strength >= i ? (strength === 1 ? 'bg-amber-400' : strength === 2 ? 'bg-cyan-400' : 'bg-emerald-400') : 'bg-white/10')}
                />
              ))}
            </div>
            <span className="w-20 text-right text-xs text-slate-400">{STRENGTH[strength]}</span>
          </div>
        )}
        <Button type="submit" variant="accent" size="lg" className="w-full" loading={pending}>
          Create account <ArrowRight size={16} aria-hidden />
        </Button>
        <p className="text-center text-xs text-slate-500">Your password is hashed with Argon2id. Pulse never stores it in plain text.</p>
      </form>
    </AuthShell>
  );
}
