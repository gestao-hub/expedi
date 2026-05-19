'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';

const veiculoSchema = z.object({
  id:            z.uuid().optional(),
  placa:         z.string().min(1, 'Placa obrigatória').max(20),
  modelo:        z.string().max(250).nullable().optional(),
  marca:         z.string().max(250).nullable().optional(),
  capacidade_kg: z.number().nullable().optional(),
  observacoes:   z.string().max(5000).nullable().optional(),
  ativo:         z.boolean().default(true),
});

export type VeiculoInput = z.infer<typeof veiculoSchema>;

export async function saveVeiculoAction(input: VeiculoInput) {
  const parsed = veiculoSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Dados inválidos' };
  const { id, ...d } = parsed.data;
  const supabase = await createClient();
  if (id) {
    const { error } = await supabase.from('veiculos').update(d).eq('id', id);
    if (error) return { error: error.message };
  } else {
    const { error } = await supabase.from('veiculos').insert(d);
    if (error) return { error: error.message };
  }
  revalidatePath('/admin/veiculos');
  return { ok: true as const };
}

export async function deleteVeiculoAction(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from('veiculos').delete().eq('id', id);
  if (error) return { error: error.message };
  revalidatePath('/admin/veiculos');
  return { ok: true as const };
}
