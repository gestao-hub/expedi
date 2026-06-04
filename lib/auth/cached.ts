import { cache } from 'react';
import { unstable_cache } from 'next/cache';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';

/**
 * getUser deduplicado dentro do mesmo render (layout + páginas + helpers chamam 1x só).
 * React.cache memoiza por-request — zero staleness (não atravessa requests).
 */
export const getAuthUserCached = cache(async () => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  return data.user ?? null;
});

/** profile do usuário logado, deduplicado por-request. */
export const getProfileCached = cache(async (userId: string) => {
  const supabase = await createClient();
  const { data } = await supabase.from('profiles').select('*').eq('id', userId).single();
  return data ?? null;
});

export type EmpresaConfig = {
  id: string;
  nome: string;
  slug: string;
  logo_url: string | null;
  cor_primaria: string | null;
  usa_os: boolean;
};

/**
 * Config da empresa (white-label) — quase-estática, lida em TODA navegação. Cache cross-request
 * de 10min via unstable_cache; usa service_role (sem cookies → cacheável; dado não-sensível,
 * escopado pela chave empresaId). Os campos (nome/logo/cor/usa_os) são definidos no
 * provisionamento e NÃO mudam em runtime — o TTL de 10min basta. Se um dia surgir edição de
 * branding na UI, invalidar com revalidateTag(`empresa-${id}`) na action correspondente.
 */
export function getEmpresaConfigCached(empresaId: string): Promise<EmpresaConfig | null> {
  return unstable_cache(
    async () => {
      const sb = createServiceRoleClient();
      const { data } = await sb
        .from('empresas')
        .select('id, nome, slug, logo_url, cor_primaria, usa_os')
        .eq('id', empresaId)
        .single();
      return (data as EmpresaConfig) ?? null;
    },
    ['empresa-config', empresaId],
    { revalidate: 600, tags: [`empresa-${empresaId}`] },
  )();
}
