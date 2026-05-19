'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';

const motoristaSchema = z.object({
  id:          z.uuid().optional(),
  nome:        z.string().min(1, 'Nome obrigatório').max(250),
  cpf:         z.string().max(20).nullable().optional(),
  cnh:         z.string().max(20).nullable().optional(),
  telefone:    z.string().max(80).nullable().optional(),
  observacoes: z.string().max(5000).nullable().optional(),
  ativo:       z.boolean().default(true),
});

export type MotoristaInput = z.infer<typeof motoristaSchema>;

export async function saveMotoristaAction(input: MotoristaInput) {
  const parsed = motoristaSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Dados inválidos' };
  const { id, ...d } = parsed.data;
  const supabase = await createClient();
  if (id) {
    const { error } = await supabase.from('motoristas').update(d).eq('id', id);
    if (error) return { error: error.message };
  } else {
    const { error } = await supabase.from('motoristas').insert(d);
    if (error) return { error: error.message };
  }
  revalidatePath('/admin/motoristas');
  return { ok: true as const };
}

export async function deleteMotoristaAction(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from('motoristas').delete().eq('id', id);
  if (error) return { error: error.message };
  revalidatePath('/admin/motoristas');
  return { ok: true as const };
}
