'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { logisticaFormSchema, type LogisticaFormInput } from '@/lib/validators/logistica';

export type LogisticaResult = { error: string } | { ok: true };

export async function salvarLogisticaAction(
  pedidoId: string,
  raw: LogisticaFormInput,
): Promise<LogisticaResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Não autenticado' };

  const parsed = logisticaFormSchema.safeParse(raw);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Dados inválidos' };
  }

  const { error } = await supabase.from('pedido_logistica').upsert({
    pedido_id:  pedidoId,
    updated_by: user.id,
    ...parsed.data,
  });

  if (error) return { error: error.message };

  revalidatePath(`/logistica/${pedidoId}`);
  return { ok: true };
}
