'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { LoginRequest } from '@acceptance/shared';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/data/form-field';
import { Alert } from '@/components/ui/alert';

type LoginValues = { email: string; password: string };

export function LoginForm({ next }: { next: string }) {
  const t = useTranslations('auth');
  const tErr = useTranslations('errors');
  const router = useRouter();
  const [failure, setFailure] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginValues>({ resolver: zodResolver(LoginRequest), defaultValues: { email: '', password: '' } });

  async function onSubmit(values: LoginValues): Promise<void> {
    setFailure(null);
    let res: Response;
    try {
      res = await fetch('/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(values) });
    } catch {
      setFailure(tErr('NETWORK'));
      return;
    }
    if (res.ok) {
      router.replace(next);
      router.refresh();
      return;
    }
    const body = (await res.json().catch(() => null)) as { error?: { code?: string } } | null;
    const code = body?.error?.code;
    setFailure(code === 'INVALID_CREDENTIALS' ? tErr('INVALID_CREDENTIALS') : code === 'TOO_MANY_REQUESTS' ? tErr('TOO_MANY_REQUESTS') : code === 'API_UNREACHABLE' ? tErr('API_UNREACHABLE') : tErr('GENERIC'));
  }

  return (
    <Card>
      <CardContent className="p-5">
        <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
          {failure ? (
            <Alert tone="danger" role="alert">
              {failure}
            </Alert>
          ) : null}
          <Field id="email" label={t('email')} error={errors.email ? t('invalidEmail') : undefined}>
            <Input
              id="email"
              type="email"
              autoComplete="username"
              dir="ltr"
              className="text-start"
              aria-invalid={!!errors.email}
              aria-describedby={errors.email ? 'email-error' : undefined}
              {...register('email')}
            />
          </Field>
          <Field id="password" label={t('password')} error={errors.password ? t('required') : undefined}>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              dir="ltr"
              className="text-start"
              aria-invalid={!!errors.password}
              aria-describedby={errors.password ? 'password-error' : undefined}
              {...register('password')}
            />
          </Field>
          <Button type="submit" size="lg" loading={isSubmitting}>
            {t('submit')}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
