'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isHub } from '@/lib/runtime';
import { criarColaboradorSchema, idColaboradorSchema } from '@/lib/validators/colaborador';
import { criarColaborador } from '@/lib/colaboradores/criar';
import { desativarColaborador, reativarColaborador } from '@/lib/colaboradores/desativar';

const SO_NUVEM = 'A gestão de equipe é feita no Exped na nuvem.';

/** Resolve o chamador: precisa ser admin com empresa. Retorna a empresa dele. */
async function exigirAdminComEmpresa(): Promise<
  { userId: string; empresaId: string } | { error: string }
> {
  const supa = await createClient();
  const {
    data: { user },
  } = await supa.auth.getUser();
  if (!user) return { error: 'Não autenticado' };
  const { data: me } = await supa.from('profiles').select('role, empresa_id').eq('id', user.id).single();
  if (me?.role !== 'admin') return { error: 'Apenas admin pode gerenciar a equipe' };
  if (!me?.empresa_id) return { error: 'Seu perfil não tem empresa' };
  return { userId: user.id, empresaId: me.empresa_id as string };
}

const updateRoleSchema = z.object({ id: z.uuid(), role: z.enum(['admin', 'vendedor', 'logistica']) });

export async function updateUserRoleAction(input: { id: string; role: string }) {
  if (isHub()) return { error: SO_NUVEM };
  const parsed = updateRoleSchema.safeParse(input);
  if (!parsed.success) return { error: 'Dados inválidos' };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Não autenticado' };

  const { data: me } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (me?.role !== 'admin') return { error: 'Apenas admin pode alterar roles' };

  if (parsed.data.id === user.id && parsed.data.role !== 'admin') {
    return { error: 'Você não pode rebaixar seu próprio role' };
  }

  const { error } = await supabase.from('profiles').update({ role: parsed.data.role }).eq('id', parsed.data.id);
  if (error) return { error: error.message };
  revalidatePath('/admin/usuarios');
  return { ok: true as const };
}

export async function criarColaboradorAction(input: unknown) {
  if (isHub()) return { error: SO_NUVEM };
  const parsed = criarColaboradorSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Dados inválidos' };
  const who = await exigirAdminComEmpresa();
  if ('error' in who) return who;
  const r = await criarColaborador(createAdminClient(), who.empresaId, parsed.data);
  if ('error' in r) return r;
  revalidatePath('/admin/usuarios');
  return { ok: true as const, aviso: r.aviso };
}

export async function desativarColaboradorAction(input: unknown) {
  if (isHub()) return { error: SO_NUVEM };
  const parsed = idColaboradorSchema.safeParse(input);
  if (!parsed.success) return { error: 'Dados inválidos' };
  const who = await exigirAdminComEmpresa();
  if ('error' in who) return who;
  if (parsed.data.id === who.userId) return { error: 'Você não pode desativar a si mesmo' };
  const r = await desativarColaborador(createAdminClient(), { id: parsed.data.id, empresaId: who.empresaId });
  if ('error' in r) return r;
  revalidatePath('/admin/usuarios');
  return { ok: true as const };
}

export async function reativarColaboradorAction(input: unknown) {
  if (isHub()) return { error: SO_NUVEM };
  const parsed = idColaboradorSchema.safeParse(input);
  if (!parsed.success) return { error: 'Dados inválidos' };
  const who = await exigirAdminComEmpresa();
  if ('error' in who) return who;
  const r = await reativarColaborador(createAdminClient(), { id: parsed.data.id, empresaId: who.empresaId });
  if ('error' in r) return r;
  revalidatePath('/admin/usuarios');
  return { ok: true as const };
}
