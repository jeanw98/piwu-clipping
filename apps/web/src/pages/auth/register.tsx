import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { registerSchema, type RegisterInput } from '@piwu/shared';
import { useAuth } from '@/auth/auth-context';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AuthShell } from './login';

export function RegisterPage() {
  const { user, register } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const form = useForm<RegisterInput>({
    resolver: zodResolver(registerSchema),
    defaultValues: { email: '', password: '', name: '' },
  });

  if (user) {
    return <Navigate to="/dashboard" replace />;
  }

  const onSubmit = form.handleSubmit(async (values) => {
    setError(null);
    try {
      await register(values.email, values.password, values.name);
      navigate('/dashboard');
    } catch {
      setError('Could not create account. Email may already be in use.');
    }
  });

  return (
    <AuthShell
      title="Create your studio"
      subtitle="Generate 9:16 clips from a single prompt."
    >
      <form className="space-y-4" onSubmit={onSubmit}>
        <div className="space-y-2">
          <Label htmlFor="name">Name</Label>
          <Input id="name" {...form.register('name')} />
        </div>
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
          {form.formState.isSubmitting ? 'Creating…' : 'Create account'}
        </Button>
      </form>
      <p className="mt-6 text-center text-sm text-mist">
        Already have an account?{' '}
        <Link className="text-accent hover:underline" to="/auth/login">
          Sign in
        </Link>
      </p>
    </AuthShell>
  );
}
