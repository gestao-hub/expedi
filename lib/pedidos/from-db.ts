import type { PedidoFormInput } from '@/lib/validators/pedido';

type PedidoRow = {
  documento_erp: string | null; data_emissao: string | null; data_entrega: string | null;
  cliente_codigo: string | null; cliente_nome: string; cliente_cnpj_cpf: string | null;
  cliente_endereco: string | null; cliente_bairro: string | null; cliente_cidade: string | null;
  cliente_uf: string | null; cliente_cep: string | null; cliente_telefone: string | null;
  cliente_endereco_id: string | null; forma_pagamento: string | null; parcelas: string | null;
  valor_total: number; observacoes: string | null; storage_pdf_path: string | null;
};
type ItemRow = {
  codigo: string; descricao: string; quantidade: number; unidade: string;
  preco_unitario: number; desconto: number; total: number; referencia: string | null; ordem: number | null;
};
type PontoRow = {
  tipo: 'loja' | 'deposito'; empresa_nome: string; endereco: string | null; ordem: number | null;
  itens: ItemRow[];
};

/** Converte linhas do banco (pedido + pontos + itens) em PedidoFormInput. */
export function pedidoRowsToFormInput(pedido: PedidoRow, pontos: PontoRow[]): PedidoFormInput {
  return {
    documento_erp: pedido.documento_erp,
    data_emissao: pedido.data_emissao,
    data_entrega: pedido.data_entrega,
    cliente_codigo: pedido.cliente_codigo,
    cliente_nome: pedido.cliente_nome,
    cliente_cnpj_cpf: pedido.cliente_cnpj_cpf,
    cliente_endereco: pedido.cliente_endereco,
    cliente_bairro: pedido.cliente_bairro,
    cliente_cidade: pedido.cliente_cidade,
    cliente_uf: pedido.cliente_uf,
    cliente_cep: pedido.cliente_cep,
    cliente_telefone: pedido.cliente_telefone,
    cliente_endereco_id: pedido.cliente_endereco_id,
    forma_pagamento: pedido.forma_pagamento,
    parcelas: pedido.parcelas,
    valor_total: pedido.valor_total,
    observacoes: pedido.observacoes,
    storage_pdf_path: pedido.storage_pdf_path,
    pontos_retirada: [...pontos]
      .sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0))
      .map((p) => ({
        tipo: p.tipo,
        empresa_nome: p.empresa_nome,
        endereco: p.endereco,
        itens: [...(p.itens ?? [])]
          .sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0))
          .map((it) => ({
            codigo: it.codigo, descricao: it.descricao, quantidade: it.quantidade,
            unidade: it.unidade, preco_unitario: it.preco_unitario, desconto: it.desconto,
            total: it.total, referencia: it.referencia,
          })),
      })),
  };
}
