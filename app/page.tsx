import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

/**
 * Entrada: manda cada usuário pra sua área. Platform admin (operador) → /plataforma;
 * senão, área do role. Sem sessão → /login.
 */
export default async function RootPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: p } = await supabase
    .from('profiles')
    .select('role, is_platform_admin')
    .eq('id', user.id)
    .single();

  if (p?.is_platform_admin) redirect('/plataforma');
  if (p?.role === 'logistica') redirect('/logistica');
  if (p?.role === 'admin') redirect('/admin');
  redirect('/vendas');
}
