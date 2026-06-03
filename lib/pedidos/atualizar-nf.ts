import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, TablesUpdate } from '@/lib/types/database';

export interface NfFields {
  nf_numero?: string | null;
  nf_chave?: string | null;
  nf_emitida_em?: string | null;
  nf_valor?: number | null;
}

export interface PagamentoFields {
  forma_pagamento?: Database['public']['Enums']['forma_pagamento_tipo'] | null;
  parcelas?: number | null;
}

export type AtualizarNfResult =
  | { updated: true; id: string }
  | { nochange: true; id: string }
  | { notfound: true };

/**
 * Preenche SÓ os campos atualmente nulos de NF/pagamento no pedido existente
 * (achado por documento_erp + empresa, status != cancelado). Nunca toca em
 * status/itens/pontos/cliente — não atropela edição da equipe. Idempotente.
 */
export async function atualizarNfPedido(
  supabase: SupabaseClient<Database>,
  opts: { empresaId: string; documentoErp: string; nf: NfFields; pagamento: PagamentoFields },
): Promise<AtualizarNfResult> {
  const { data: existing } = await supabase
    .from('pedidos')
    .select('id, nf_numero, nf_chave, nf_emitida_em, nf_valor, forma_pagamento, parcelas')
    .eq('documento_erp', opts.documentoErp)
    .eq('empresa_id', opts.empresaId)
    .neq('status', 'cancelado')
    .maybeSingle();

  if (!existing) return { notfound: true };

  const patch: Partial<TablesUpdate<'pedidos'>> = {};
  if (existing.nf_numero == null && opts.nf.nf_numero != null) patch.nf_numero = opts.nf.nf_numero;
  if (existing.nf_chave == null && opts.nf.nf_chave != null) patch.nf_chave = opts.nf.nf_chave;
  if (existing.nf_emitida_em == null && opts.nf.nf_emitida_em != null)
    patch.nf_emitida_em = opts.nf.nf_emitida_em;
  if (existing.nf_valor == null && opts.nf.nf_valor != null) patch.nf_valor = opts.nf.nf_valor;
  if (existing.forma_pagamento == null && opts.pagamento.forma_pagamento != null)
    patch.forma_pagamento = opts.pagamento.forma_pagamento;
  if (existing.parcelas == null && opts.pagamento.parcelas != null) patch.parcelas = opts.pagamento.parcelas;

  if (Object.keys(patch).length === 0) return { nochange: true, id: existing.id };

  const { error } = await supabase.from('pedidos').update(patch).eq('id', existing.id);
  if (error) throw new Error(error.message);
  return { updated: true, id: existing.id };
}
