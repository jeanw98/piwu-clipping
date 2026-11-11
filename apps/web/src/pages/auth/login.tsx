import { useState, type ReactNode } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { loginSchema, type LoginInput } from '@piwu/shared';
import { useAuth } from '@/auth/auth-context';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function LoginPage() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const form = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  if (user) {
    return <Navigate to="/dashboard" replace />;
  }

  const onSubmit = form.handleSubmit(async (values) => {
    setError(null);
    try {
      await login(values.email, values.password);
      navigate('/dashboard');
    } catch {
      setError('Invalid email or password');
    }
  });

  return (
    <AuthShell
      title="Welcome back"
      subtitle="Sign in to generate vertical viral clips."
    >
      <form className="space-y-4" onSubmit={onSubmit}>
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input id="email" type="email" {...form.register('email')} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <Input id="password" type="password" {...form.register('password')} />
        </div>
        {error ? <p className="text-sm text-red-400">{error}</p> : null}
        <Button className="w-full" type="submit" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting ? 'Signing in…' : 'Sign in'}
        </Button>
      </form>
      <p className="mt-6 text-center text-sm text-mist">
        No account?{' '}
        <Link className="text-accent hover:underline" to="/auth/register">
          Create one
        </Link>
      </p>
    </AuthShell>
  );
}

export function AuthShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <div className="relative flex min-h-screen items-center justify-center bg-grain px-4">
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -left-20 top-24 h-72 w-72 rounded-full bg-accent/10 blur-3xl" />
        <div className="absolute -right-10 bottom-10 h-80 w-80 rounded-full bg-sky-500/10 blur-3xl" />
      </div>
      <div className="relative w-full max-w-md rounded-2xl border border-white/10 bg-ink-900/80 p-8 shadow-glow backdrop-blur">
        <div className="mb-8">
          <div className="font-display text-3xl font-bold tracking-tight text-white">
            PIWU
          </div>
          <h1 className="mt-4 font-display text-2xl font-semibold text-white">
            {title}
          </h1>
          <p className="mt-2 text-sm text-mist">{subtitle}</p>
        </div>
        {children}
      </div>
    </div>
  );
}
