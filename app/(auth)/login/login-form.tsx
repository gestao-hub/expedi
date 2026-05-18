'use client';

import { useActionState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2 } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { loginSchema, type LoginInput } from '@/lib/validators/auth';
import { loginAction, type LoginActionResult } from './actions';

export function LoginForm() {
  const sp = useSearchParams();
  const next = sp.get('next') ?? '';

  const [state, formAction, isPending] = useActionState<LoginActionResult, FormData>(
    loginAction,
    undefined,
  );

  const form = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  return (
    <Form {...form}>
      <form action={formAction} className="space-y-4">
        <input type="hidden" name="next" value={next} />

        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>E-mail</FormLabel>
              <FormControl>
                <Input
                  {...field}
                  type="email"
                  autoComplete="email"
                  placeholder="seu@email.com"
                  disabled={isPending}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="password"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Senha</FormLabel>
              <FormControl>
                <Input
                  {...field}
                  type="password"
                  autoComplete="current-password"
                  disabled={isPending}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {state?.error && (
          <p className="text-sm font-medium text-destructive">{state.error}</p>
        )}

        <Button
          type="submit"
          disabled={isPending}
          className="w-full bg-franzoni-orange hover:bg-franzoni-orange-600 text-white"
        >
          {isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          Entrar
        </Button>

        <p className="text-center text-xs text-muted-foreground pt-2">
          Esqueceu a senha? Fale com o administrador.
        </p>
      </form>
    </Form>
  );
}
