import { z } from 'zod';

export const criarColaboradorSchema = z.object({
  full_name: z.string().min(1, 'Nome obrigatório').max(200),
  email: z.email('E-mail inválido'),
  // bcrypt trunca em 72 bytes; min 8 por segurança básica.
  password: z.string().min(8, 'Senha precisa de ao menos 8 caracteres').max(72),
  role: z.enum(['admin', 'vendedor', 'logistica']),
  hiper_usuario_id: z.coerce.number().int().positive().optional(),
  hiper_usuario_nome: z.string().max(200).optional(),
});
export type CriarColaboradorInput = z.infer<typeof criarColaboradorSchema>;

export const idColaboradorSchema = z.object({ id: z.uuid() });
export type IdColaboradorInput = z.infer<typeof idColaboradorSchema>;
