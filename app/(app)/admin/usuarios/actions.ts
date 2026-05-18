'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';

const updateRoleSchema = z.object({
  id: z.uuid(),
  role: z.enum(['admin', 'vendedor', 'logistica']),
});

export async function updateUserRoleAction(input: { id: string; role: string }) {
  const parsed = updateRoleSchema.safeParse(input);
  if (!parsed.success) return { error: 'Dados inválidos' };

  const supabase = await createClient();

  // Confere se quem chama é admin (RLS já garante, mas damos erro claro)
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Não autenticado' };

  const { data: me } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (me?.role !== 'admin') return { error: 'Apenas admin pode alterar roles' };

  if (parsed.data.id === user.id && parsed.data.role !== 'admin') {
    return { error: 'Você não pode rebaixar seu próprio role' };
  }

  const { error } = await supabase
    .from('profiles')
    .update({ role: parsed.data.role })
    .eq('id', parsed.data.id);

  if (error) return { error: error.message };
  revalidatePath('/admin/usuarios');
  return { ok: true as const };
}
