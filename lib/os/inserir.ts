import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/types/database';
import type { IngestOsInput } from '@/lib/validators/ingest-os';

export type InserirOsResult =
  | { error: string }
  | { id: string }
  | { duplicate: true; existing_id: string };

/**
 * Insere uma Ordem de Serviço (cabeçalho + peças + serviços). Reutilizável.
 * empresaId: omitir em sessão de usuário (DEFAULT current_empresa_id()); obrigatório no
 * ingest (service_role) — também escopa a dedup. Dedup por documento_erp.
 */
export async function inserirOrdemServico(
  supabase: SupabaseClient<Database>,
  d: IngestOsInput,
  opts: { vendedorId: string; empresaId?: string; storagePdfPath?: string | null },
): Promise<InserirOsResult> {
  if (d.documento_erp) {
    let q = supabase.from('ordens_servico').select('id').eq('documento_erp', d.documento_erp);
    if (opts.empresaId) q = q.eq('empresa_id', opts.empresaId);
    const { data: ex } = await q.maybeSingle();
    if (ex) return { duplicate: true, existing_id: ex.id as string };
  }

  const valorTotal =
    d.itens.reduce((s, i) => s + (i.total || 0), 0) +
    d.servicos.reduce((s, x) => s + (x.total || 0), 0);

  const row: Database['public']['Tables']['ordens_servico']['Insert'] = {
    documento_erp: d.documento_erp ?? null,
    os_erp_id: d.os_erp_id ?? null,
    cliente_nome: d.cliente_nome,
    cliente_cnpj_cpf: d.cliente_cnpj_cpf ?? null,
    cliente_telefone: d.cliente_telefone ?? null,
    categoria: d.categoria ?? null,
    situacao_erp: d.situacao_erp ?? null,
    prioridade: d.prioridade ?? null,
    data_abertura: d.data_abertura ?? null,
    data_previsao: d.data_previsao ?? null,
    data_conclusao: d.data_conclusao ?? null,
    objeto: d.objeto ?? null,
    defeito_relatado: d.defeito_relatado ?? null,
    diagnostico: d.diagnostico ?? null,
    garantia_inicio: d.garantia_inicio ?? null,
    garantia_fim: d.garantia_fim ?? null,
    observacao: d.observacao ?? null,
    tecnico_nome: d.servicos.find((s) => s.tecnico_nome)?.tecnico_nome ?? null,
    valor_total: valorTotal,
    vendedor_id: opts.vendedorId,
    storage_pdf_path: opts.storagePdfPath ?? null,
  };
  if (opts.empresaId) row.empresa_id = opts.empresaId;

  const { data: os, error } = await supabase
    .from('ordens_servico').insert(row).select('id').single();
  if (error || !os) {
    if (error?.code === '23505') return { error: `OS ${d.documento_erp} já existe.` };
    return { error: error?.message ?? 'Falha ao criar OS' };
  }
  const osId = os.id as string;

  if (d.itens.length) {
    const { error: e } = await supabase.from('os_itens').insert(
      d.itens.map((it, idx) => ({
        os_id: osId, codigo: it.codigo ?? null, descricao: it.descricao,
        quantidade: it.quantidade, unidade: it.unidade ?? null,
        preco_unitario: it.preco_unitario, desconto: it.desconto, total: it.total, ordem: idx,
      })),
    );
    if (e) return { error: `Falha nas peças: ${e.message}` };
  }
  if (d.servicos.length) {
    const { error: e } = await supabase.from('os_servicos').insert(
      d.servicos.map((sv, idx) => ({
        os_id: osId, descricao: sv.descricao, quantidade: sv.quantidade,
        valor_unitario: sv.valor_unitario, total: sv.total,
        tecnico_nome: sv.tecnico_nome ?? null, ordem: idx,
      })),
    );
    if (e) return { error: `Falha nos serviços: ${e.message}` };
  }
  return { id: osId };
}
