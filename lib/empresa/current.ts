import { getAuthUserCached, getProfileCached, getEmpresaConfigCached } from '@/lib/auth/cached';

export type EmpresaAtual = {
  id: string;
  nome: string;
  slug: string;
  logo_url: string | null;
  cor_primaria: string | null;
  usa_os: boolean;
};

/**
 * Carrega a empresa (tenant) do usuário logado — usada pro white-label (nome/logo/cor).
 * getUser/profile vêm do cache por-request (React.cache); a config da empresa do cache
 * cross-request (10min). Devolve null se não houver usuário ou empresa associada.
 */
export async function getEmpresaAtual(): Promise<EmpresaAtual | null> {
  const user = await getAuthUserCached();
  if (!user) return null;

  const profile = await getProfileCached(user.id);
  if (!profile?.empresa_id) return null;

  return getEmpresaConfigCached(profile.empresa_id as string);
}
