import type { SupabaseClient } from '@supabase/supabase-js';
import type { CriarColaboradorInput } from '@/lib/validators/colaborador';

export type CriarColaboradorResult = { ok: true; id: string } | { error: string };

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
  if (e2) return { error: `Usuário criado, mas atribuição falhou: ${e2.message}` };

  if (input.role === 'vendedor' && input.hiper_usuario_id != null) {
    const { error: e3 } = await admin.from('hiper_vendedor_map').upsert({
      empresa_id: empresaId,
      hiper_usuario_id: input.hiper_usuario_id,
      vendedor_id: id,
      hiper_usuario_nome: input.hiper_usuario_nome ?? input.full_name,
    });
    if (e3) return { error: `Colaborador criado, mas o mapa do Hiper falhou: ${e3.message}` };
  }
  return { ok: true, id };
}
