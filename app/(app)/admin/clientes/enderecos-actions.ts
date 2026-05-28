'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';

const enderecoSchema = z.object({
  rotulo:   z.string().min(1, 'Rótulo obrigatório').max(120),
  endereco: z.string().max(1000).nullable().optional(),
  bairro:   z.string().max(250).nullable().optional(),
  cidade:   z.string().max(250).nullable().optional(),
  uf:       z.string().max(2).nullable().optional(),
  cep:      z.string().max(20).nullable().optional(),
  telefone: z.string().max(80).nullable().optional(),
});

export type EnderecoInput = z.infer<typeof enderecoSchema>;

/**
 * Cria endereço pra um cliente. Disponível pra qualquer autenticado
 * (vendedor pode adicionar inline no pedido). RLS já restringe quem chega aqui.
 */
export async function criarEnderecoAction(
  cliente_id: string,
  input: EnderecoInput,
): Promise<{ id: string } | { error: string }> {
  const parsed = enderecoSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Dados inválidos' };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('cliente_enderecos')
    .insert({ cliente_id, ...parsed.data })
    .select('id')
    .single();
  if (error || !data) return { error: error?.message ?? 'Falha ao criar endereço' };

  revalidatePath('/admin/clientes');
  return { id: data.id as string };
}

/** Edita endereço — só admin (RLS bloqueia vendedor) */
export async function atualizarEnderecoAction(id: string, input: EnderecoInput) {
  const parsed = enderecoSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Dados inválidos' };

  const supabase = await createClient();
  const { error } = await supabase
    .from('cliente_enderecos')
    .update(parsed.data)
    .eq('id', id);
  if (error) return { error: error.message };

  revalidatePath('/admin/clientes');
  return { ok: true as const };
}

/** Remove endereço — só admin */
export async function removerEnderecoAction(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from('cliente_enderecos').delete().eq('id', id);
  if (error) return { error: error.message };
  revalidatePath('/admin/clientes');
  return { ok: true as const };
}

/**
 * Marca um endereço como padrão. Desmarca o atual antes (unique parcial:
 * 1 padrão por cliente).
 */
export async function marcarPadraoAction(id: string) {
  const supabase = await createClient();

  // 1. Descobre cliente_id do endereço alvo
  const { data: alvo, error: e0 } = await supabase
    .from('cliente_enderecos')
    .select('cliente_id, is_padrao')
    .eq('id', id)
    .single();
  if (e0 || !alvo) return { error: e0?.message ?? 'Endereço não encontrado' };
  if (alvo.is_padrao) return { ok: true as const }; // já é

  // 2. Desmarca o padrão anterior (se houver)
  const { error: e1 } = await supabase
    .from('cliente_enderecos')
    .update({ is_padrao: false })
    .eq('cliente_id', alvo.cliente_id)
    .eq('is_padrao', true);
  if (e1) return { error: `Falha ao desmarcar anterior: ${e1.message}` };

  // 3. Marca o novo
  const { error: e2 } = await supabase
    .from('cliente_enderecos')
    .update({ is_padrao: true })
    .eq('id', id);
  if (e2) return { error: e2.message };

  revalidatePath('/admin/clientes');
  return { ok: true as const };
}
