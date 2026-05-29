import { describe, it, expect } from 'vitest';
import { extrairPagamentoDoPdfText } from './extrair-pagamento';

describe('extrairPagamentoDoPdfText', () => {
  it('extrai forma de pagamento e parcelas de um pedido com pagamento', () => {
    const texto = [
      'Total 16,79',
      'Forma de Pagamento: ENTREGA A RECEBER 10x',
      'Observação: ENTREGAR EM UMA CASA',
      'É vedada a autenticação deste documento',
    ].join('\n');
    expect(extrairPagamentoDoPdfText(texto)).toEqual({
      forma_pagamento: 'ENTREGA A RECEBER',
      parcelas: '10x',
    });
  });

  it('devolve campos vazios quando o PDF não tem pagamento', () => {
    const texto = 'Total 16,79\nForma de Pagamento:\nÉ vedada';
    expect(extrairPagamentoDoPdfText(texto)).toEqual({
      forma_pagamento: null,
      parcelas: null,
    });
  });
});
