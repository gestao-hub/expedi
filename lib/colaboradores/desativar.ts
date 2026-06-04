import type { SupabaseClient } from '@supabase/supabase-js';

export type ToggleResult = { ok: true } | { error: string };

const BAN_FOREVER = '876000h'; // ~100 anos — bloqueia login até reativar.

/** Confirma que o alvo pertence à empresa do chamador antes de mutar (service_role ignora RLS). */
async function alvoDaEmpresa(admin: SupabaseClient, id: string, empresaId: string): Promise<boolean> {
  const { data } = await admin
    .from('profiles')
    .select('id')
    .eq('id', id)
    .eq('empresa_id', empresaId)
    .maybeSingle();
  return !!data;
}

export async function desativarColaborador(
  admin: SupabaseClient,
  { id, empresaId }: { id: string; empresaId: string },
): Promise<ToggleResult> {
  if (!(await alvoDaEmpresa(admin, id, empresaId))) return { error: 'Colaborador não encontrado nesta empresa' };
  const { error: e1 } = await admin.auth.admin.updateUserById(id, { ban_duration: BAN_FOREVER });
  if (e1) return { error: e1.message };
  const { error: e2 } = await admin.from('profiles').update({ ativo: false }).eq('id', id).eq('empresa_id', empresaId);
  if (e2) {
    // 2ª escrita falhou: reverte o ban pra não deixar estado inconsistente (login bloqueado
    // mas UI mostrando "Ativo", e o hub herdaria essa divergência pelo sync).
    await admin.auth.admin.updateUserById(id, { ban_duration: 'none' }).catch(() => {});
    return { error: e2.message };
  }
  return { ok: true };
}

export async function reativarColaborador(
  admin: SupabaseClient,
  { id, empresaId }: { id: string; empresaId: string },
): Promise<ToggleResult> {
  if (!(await alvoDaEmpresa(admin, id, empresaId))) return { error: 'Colaborador não encontrado nesta empresa' };
  const { error: e1 } = await admin.auth.admin.updateUserById(id, { ban_duration: 'none' });
  if (e1) return { error: e1.message };
  const { error: e2 } = await admin.from('profiles').update({ ativo: true }).eq('id', id).eq('empresa_id', empresaId);
  if (e2) {
    // 2ª escrita falhou: re-bane pra manter consistência (senão login liberado mas UI "Inativo").
    await admin.auth.admin.updateUserById(id, { ban_duration: BAN_FOREVER }).catch(() => {});
    return { error: e2.message };
  }
  return { ok: true };
}
