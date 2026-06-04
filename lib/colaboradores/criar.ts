import type { SupabaseClient } from '@supabase/supabase-js';
import type { CriarColaboradorInput } from '@/lib/validators/colaborador';

export type CriarColaboradorResult = { ok: true; id: string; aviso?: string } | { error: string };

/**
 * Cria um colaborador NA NUVEM (fonte da verdade) e o desce pro hub pelo sync.
 * `admin` é um client service_role (ignora RLS). `empresaId` vem SEMPRE do servidor
 * (empresa do chamador) — nunca do input, pra um admin não criar em outra empresa.
 */
export async function criarColaborador(
  admin: SupabaseClient,
  empresaId: string,
  input: CriarColaboradorInput,
): Promise<CriarColaboradorResult> {
  // Conflito de mapeamento Hiper ANTES de criar o usuário: se o id do Hiper já está
  // vinculado a OUTRO vendedor desta empresa, rejeitamos. Senão o upsert (PK = empresa_id
  // + hiper_usuario_id) sobrescreveria o vínculo em silêncio e "sequestraria" as vendas
  // do vendedor antigo. Também evita criar um auth.user que não poderá ser mapeado.
  if (input.role === 'vendedor' && input.hiper_usuario_id != null) {
    const { data: jaMapeado } = await admin
      .from('hiper_vendedor_map')
      .select('vendedor_id')
      .eq('empresa_id', empresaId)
      .eq('hiper_usuario_id', input.hiper_usuario_id)
      .maybeSingle();
    if (jaMapeado) {
      return { error: `Esse ID do Hiper (${input.hiper_usuario_id}) já está vinculado a outro vendedor.` };
    }
  }

  const { data: created, error: e1 } = await admin.auth.admin.createUser({
    email: input.email,
    password: input.password,
    email_confirm: true,
    user_metadata: { full_name: input.full_name },
  });
  if (e1 || !created?.user) {
    const msg = e1?.message || 'Falha ao criar usuário';
    return {
      error: /already.*registered|already exists/i.test(msg)
        ? 'Já existe um colaborador com esse email'
        : msg,
    };
  }
  const id = created.user.id;

  // Trigger handle_new_user já criou o profile (role=vendedor, empresa=null, ativo=true).
  // Atribuímos empresa/role/nome via service_role (prevent_self_role_change libera com auth.uid() null).
  const { error: e2 } = await admin
    .from('profiles')
    .update({ empresa_id: empresaId, role: input.role, full_name: input.full_name, ativo: true })
    .eq('id', id);
  if (e2) {
    // Reverte o auth.user pra não deixar usuário órfão (email queimado / login sem dono/empresa)
    // e permitir o admin tentar de novo do zero.
    await admin.auth.admin.deleteUser(id).catch(() => {});
    return { error: `Falha ao atribuir empresa/cargo: ${e2.message}` };
  }

  if (input.role === 'vendedor' && input.hiper_usuario_id != null) {
    const { error: e3 } = await admin.from('hiper_vendedor_map').upsert({
      empresa_id: empresaId,
      hiper_usuario_id: input.hiper_usuario_id,
      vendedor_id: id,
      hiper_usuario_nome: input.hiper_usuario_nome ?? input.full_name,
    });
    // O colaborador já foi criado e atribuído (login válido). O mapa é NÃO-FATAL: avisamos
    // em vez de retornar erro — senão a UI mostraria falha e o admin tentaria de novo
    // (→ email duplicado). O vínculo pode ser refeito na tela de mapeamento da nuvem.
    if (e3) return { ok: true, id, aviso: `Colaborador criado, mas o vínculo com o Hiper falhou: ${e3.message}` };
  }
  return { ok: true, id };
}
