import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { brDate, brNumber, parseFranzoniErp } from './franzoni-erp';

const fixture = readFileSync(
  resolve(__dirname, '../../tests/fixtures/pedido-L4077.txt'),
  'utf-8',
);

describe('helpers', () => {
  it('brNumber: aceita BR e devolve 0 para vazio', () => {
    expect(brNumber('16,79')).toBe(16.79);
    expect(brNumber('1.234,56')).toBe(1234.56);
    expect(brNumber('0,00')).toBe(0);
    expect(brNumber(null)).toBe(0);
    expect(brNumber('')).toBe(0);
  });

  it('brDate: dd/mm/yyyy → yyyy-mm-dd', () => {
    expect(brDate('14/05/2026')).toBe('2026-05-14');
    expect(brDate('14/05/2026 16:18')).toBe('2026-05-14');
    expect(brDate('')).toBeUndefined();
  });
});

describe('parseFranzoniErp — fixture pedido L4077', () => {
  const r = parseFranzoniErp(fixture);

  it('documento e datas', () => {
    expect(r.documento_erp).toBe('L4077');
    expect(r.data_emissao).toBe('2026-05-14');
    expect(r.data_entrega).toBe('2026-05-14');
  });

  it('empresa emissora', () => {
    expect(r.empresa_emissora).toBe('AMY TESTE');
  });

  it('cliente', () => {
    expect(r.cliente.codigo).toBe('103');
    expect(r.cliente.nome).toBe('START SERVICE LTDA');
    expect(r.cliente.cnpj_cpf).toBe('44.531.186/0001-80');
    expect(r.cliente.endereco).toBe('Rua Tucano, 389');
    expect(r.cliente.bairro).toBe('Forquilhas');
    expect(r.cliente.cep).toBe('88107-315');
    expect(r.cliente.cidade).toBe('SÃO JOSÉ');
    expect(r.cliente.uf).toBe('SC');
    expect(r.cliente.telefone).toBe('(48) 9852-2514');
  });

  it('pontos de retirada e itens', () => {
    expect(r.pontos_retirada).toHaveLength(1);
    const p = r.pontos_retirada[0];
    expect(p.tipo).toBe('loja');
    expect(p.empresa_nome).toBe('AMY TESTE');
    expect(p.itens).toHaveLength(1);

    const it = p.itens[0];
    expect(it.codigo).toBe('5005');
    expect(it.descricao).toBe('SH CONDIC. HOMEM VERSATIL 2 EM 1 350 ML');
    expect(it.quantidade).toBe(1);
    expect(it.unidade).toBe('UN');
    expect(it.preco_unitario).toBe(16.79);
    expect(it.desconto).toBe(0);
    expect(it.total).toBe(16.79);
    expect(it.referencia).toBe('Diversos');
  });

  it('totais e pagamento', () => {
    expect(r.valor_total).toBe(16.79);
    expect(r.forma_pagamento).toBe('ENTREGA A RECEBER');
    expect(r.parcelas).toBe('10x');
  });

  it('observação', () => {
    expect(r.observacoes).toBe('ENTREGAR EM UMA CASA COM UM FUSCA VERMELHO');
  });
});

describe('robustez', () => {
  it('texto vazio → defaults seguros', () => {
    const r = parseFranzoniErp('');
    expect(r.cliente.nome).toBe('');
    expect(r.pontos_retirada).toHaveLength(1);
    expect(r.pontos_retirada[0].itens).toHaveLength(0);
    expect(r.valor_total).toBe(0);
    expect(r.documento_erp).toBeUndefined();
  });

  it('número com milhar BR', () => {
    const r = parseFranzoniErp(`Total 1.234,56\n`);
    expect(r.valor_total).toBe(1234.56);
  });

  it('texto wall-of-text (estilo unpdf) — normaliza quebras', () => {
    // Mesmo conteúdo do fixture mas sem quebras de linha
    const wall = fixture.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
    const r = parseFranzoniErp(wall);
    expect(r.documento_erp).toBe('L4077');
    expect(r.cliente.nome).toBe('START SERVICE LTDA');
    expect(r.cliente.bairro).toBe('Forquilhas');
    // bairro NÃO pode conter texto da tabela de itens
    expect(r.cliente.bairro?.length).toBeLessThan(50);
    expect(r.valor_total).toBe(16.79);
    expect(r.pontos_retirada[0].itens).toHaveLength(1);
    expect(r.pontos_retirada[0].itens[0].codigo).toBe('5005');
  });
});
