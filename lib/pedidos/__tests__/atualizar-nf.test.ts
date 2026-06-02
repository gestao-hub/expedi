import { describe, it, expect } from 'vitest';
import { atualizarNfPedido, type NfFields, type PagamentoFields } from '../atualizar-nf';

type Row = Record<string, unknown> | null;

function mockSupabase(existing: Row) {
  const updates: Record<string, unknown>[] = [];
  const filters: [string, string, unknown][] = [];
  const builder = {
    select() { return builder; },
    eq(col: string, val: unknown) { filters.push(['eq', col, val]); return builder; },
    neq(col: string, val: unknown) { filters.push(['neq', col, val]); return builder; },
    async maybeSingle() { return { data: existing }; },
    update(patch: Record<string, unknown>) {
      updates.push(patch);
      return { eq: async () => ({ error: null }) };
    },
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { client: { from: () => builder } as any, updates, filters };
}

const nf: NfFields = { nf_numero: '616', nf_chave: 'CHV', nf_emitida_em: '2026-06-02 17:23:53', nf_valor: 148 };
const pg: PagamentoFields = { forma_pagamento: 'pix', parcelas: 1 };

describe('atualizarNfPedido', () => {
  it('preenche NF e pagamento quando os campos estão nulos', async () => {
    const { client, updates } = mockSupabase({
      id: 'P1', nf_numero: null, nf_chave: null, nf_emitida_em: null, nf_valor: null,
      forma_pagamento: null, parcelas: null,
    });
    const r = await atualizarNfPedido(client, { empresaId: 'E1', documentoErp: 'DOC1', nf, pagamento: pg });
    expect(r).toEqual({ updated: true, id: 'P1' });
    expect(updates[0]).toEqual({
      nf_numero: '616', nf_chave: 'CHV', nf_emitida_em: '2026-06-02 17:23:53', nf_valor: 148,
      forma_pagamento: 'pix', parcelas: 1,
    });
  });

  it('NÃO sobrescreve campos já preenchidos', async () => {
    const { client, updates } = mockSupabase({
      id: 'P1', nf_numero: '999', nf_chave: 'JA', nf_emitida_em: '2026-01-01 00:00:00', nf_valor: 10,
      forma_pagamento: 'dinheiro', parcelas: 3,
    });
    const r = await atualizarNfPedido(client, { empresaId: 'E1', documentoErp: 'DOC1', nf, pagamento: pg });
    expect(r).toEqual({ nochange: true, id: 'P1' });
    expect(updates).toHaveLength(0);
  });

  it('preenche só o que falta (NF nula, pagamento já setado)', async () => {
    const { client, updates } = mockSupabase({
      id: 'P1', nf_numero: null, nf_chave: null, nf_emitida_em: null, nf_valor: null,
      forma_pagamento: 'dinheiro', parcelas: 2,
    });
    const r = await atualizarNfPedido(client, { empresaId: 'E1', documentoErp: 'DOC1', nf, pagamento: pg });
    expect(r).toEqual({ updated: true, id: 'P1' });
    expect(updates[0]).toEqual({
      nf_numero: '616', nf_chave: 'CHV', nf_emitida_em: '2026-06-02 17:23:53', nf_valor: 148,
    });
    expect(updates[0]).not.toHaveProperty('forma_pagamento');
  });

  it('escopa por empresa e ignora cancelado (filtros aplicados)', async () => {
    const { client, filters } = mockSupabase(null);
    await atualizarNfPedido(client, { empresaId: 'E9', documentoErp: 'DOCX', nf, pagamento: pg });
    expect(filters).toContainEqual(['eq', 'documento_erp', 'DOCX']);
    expect(filters).toContainEqual(['eq', 'empresa_id', 'E9']);
    expect(filters).toContainEqual(['neq', 'status', 'cancelado']);
  });

  it('pedido inexistente → notfound', async () => {
    const { client, updates } = mockSupabase(null);
    const r = await atualizarNfPedido(client, { empresaId: 'E1', documentoErp: 'DOC1', nf, pagamento: pg });
    expect(r).toEqual({ notfound: true });
    expect(updates).toHaveLength(0);
  });
});
