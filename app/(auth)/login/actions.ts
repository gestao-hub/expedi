'use server';

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { loginSchema } from '@/lib/validators/auth';

export type LoginActionResult = { error: string } | undefined;

export async function loginAction(
  _prev: LoginActionResult,
  formData: FormData,
): Promise<LoginActionResult> {
  const parsed = loginSchema.safeParse({
    email: String(formData.get('email') ?? '').trim(),
    password: String(formData.get('password') ?? ''),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Dados inválidos' };
  }

  const supabase = await createClient();
  const { error: signInError } = await supabase.auth.signInWithPassword(parsed.data);
  if (signInError) {
    // Mensagens do Supabase são em inglês — traduzimos as comuns
    const msg = /invalid login credentials/i.test(signInError.message)
      ? 'E-mail ou senha incorretos'
      : signInError.message;
    return { error: msg };
  }

  // Lê role para decidir rota inicial
  const {
    data: { user },
  } = await supabase.auth.getUser();
  let target = '/vendas';
  if (user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();
    if (profile?.role === 'logistica') target = '/logistica';
    else if (profile?.role === 'admin') target = '/admin';
  }

  const next = String(formData.get('next') ?? '').trim();
  redirect(next && next.startsWith('/') ? next : target);
}
