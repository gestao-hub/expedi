import { parseFranzoniErp } from './franzoni-erp';

/**
 * Extrai só a forma de pagamento + parcelas do texto do PDF do Hiper.
 * Usado na ingestão híbrida: os dados estruturados vêm do banco do Hiper, mas a
 * forma de pagamento ("ENTREGA A RECEBER 10x") só existe no PDF a nível de pedido.
 */
export function extrairPagamentoDoPdfText(text: string): {
  forma_pagamento: string | null;
  parcelas: string | null;
} {
  const p = parseFranzoniErp(text);
  return {
    forma_pagamento: p.forma_pagamento ?? null,
    parcelas: p.parcelas ?? null,
  };
}
