import { z } from 'zod';

export const logisticaFormSchema = z.object({
  pre_carga:          z.string().nullable().optional(),
  motorista:          z.string().nullable().optional(),
  veiculo:            z.string().nullable().optional(),
  km_inicial:         z.number().nullable().optional(),
  km_final:           z.number().nullable().optional(),
  regiao:             z.string().nullable().optional(),
  peso_bruto_total:   z.number().nullable().optional(),
  peso_liquido_total: z.number().nullable().optional(),
  conferente:         z.string().nullable().optional(),
  observacoes:        z.string().nullable().optional(),
});

export type LogisticaFormInput = z.infer<typeof logisticaFormSchema>;

export function emptyLogistica(): LogisticaFormInput {
  return {
    pre_carga: null,
    motorista: null,
    veiculo: null,
    km_inicial: null,
    km_final: null,
    regiao: null,
    peso_bruto_total: null,
    peso_liquido_total: null,
    conferente: null,
    observacoes: null,
  };
}
