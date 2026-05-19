import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import type { Profile, UserRole } from '@/lib/types';

/**
 * Gate de acesso por role pra ser usado no topo de cada page.tsx
 * de rota protegida. Garante que:
 *  1. Existe sessão (senão redireciona pra /login)
 *  2. O role do usuário está no array `allowed`
 *
 * Se não tem permissão, redireciona pro "home" do role real do usuário
 * — admin → /admin, logistica → /logistica, vendedor → /vendas.
 *
 * Retorna o profile pra que a page possa reusar (evita 2ª query).
 */
export async function requireRole(allowed: UserRole[]): Promise<Profile> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single();

  if (!profile) {
    // session válida mas profile sumiu — força reauth
    redirect('/auth/signout');
  }

  if (!allowed.includes(profile.role)) {
    redirect(homeFor(profile.role));
  }

  return profile as Profile;
}

export function homeFor(role: UserRole): string {
  return role === 'admin' ? '/admin' : role === 'logistica' ? '/logistica' : '/vendas';
}
