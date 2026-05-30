import { z } from 'zod';

export const osItemSchema = z.object({
  codigo: z.string().max(80).nullable().optional(),
  descricao: z.string().min(1).max(250),
  quantidade: z.number().nonnegative(),
  unidade: z.string().max(20).nullable().optional(),
  preco_unitario: z.number().nonnegative().default(0),
  desconto: z.number().nonnegative().default(0),
  total: z.number().nonnegative().default(0),
});

export const osServicoSchema = z.object({
  descricao: z.string().min(1).max(250),
  quantidade: z.number().nonnegative().default(1),
  valor_unitario: z.number().nonnegative().default(0),
  total: z.number().nonnegative().default(0),
  tecnico_nome: z.string().max(250).nullable().optional(),
});

/** Payload de Ordem de Serviço enviado pelo agente (espelha a OS do Hiper). */
export const ingestOsSchema = z.object({
  documento_erp: z.string().max(80).regex(/^[A-Za-z0-9._-]+$/, 'documento inválido').nullable().optional(),
  os_erp_id: z.number().int().nullable().optional(),
  hiper_usuario_id: z.number().int(),
  cliente_nome: z.string().min(1).max(250),
  cliente_cnpj_cpf: z.string().max(80).nullable().optional(),
  cliente_telefone: z.string().max(80).nullable().optional(),
  categoria: z.string().max(120).nullable().optional(),
  situacao_erp: z.number().int().nullable().optional(),
  prioridade: z.number().int().nullable().optional(),
  data_abertura: z.string().max(40).nullable().optional(),
  data_previsao: z.string().max(40).nullable().optional(),
  data_conclusao: z.string().max(40).nullable().optional(),
  objeto: z.string().max(500).nullable().optional(),
  defeito_relatado: z.string().max(5000).nullable().optional(),
  diagnostico: z.string().max(5000).nullable().optional(),
  garantia_inicio: z.string().max(40).nullable().optional(),
  garantia_fim: z.string().max(40).nullable().optional(),
  observacao: z.string().max(5000).nullable().optional(),
  itens: z.array(osItemSchema).max(500).default([]),
  servicos: z.array(osServicoSchema).max(500).default([]),
});

export type IngestOsInput = z.infer<typeof ingestOsSchema>;
