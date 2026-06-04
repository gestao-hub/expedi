import { describe, it, expect } from 'vitest';
import { criarColaboradorSchema } from '../colaborador';

describe('criarColaboradorSchema', () => {
  it('aceita um colaborador válido', () => {
    const r = criarColaboradorSchema.safeParse({
      full_name: 'Gustavo', email: 'gustavo@franzoni.local', password: 'Franzoni@2026', role: 'vendedor',
    });
    expect(r.success).toBe(true);
  });
  it('rejeita senha curta', () => {
    const r = criarColaboradorSchema.safeParse({
      full_name: 'X', email: 'x@y.local', password: '123', role: 'admin',
    });
    expect(r.success).toBe(false);
  });
  it('rejeita role inválido', () => {
    const r = criarColaboradorSchema.safeParse({
      full_name: 'X', email: 'x@y.local', password: 'aaaaaaaa', role: 'financeiro',
    });
    expect(r.success).toBe(false);
  });
  it('coage hiper_usuario_id string→int', () => {
    const r = criarColaboradorSchema.safeParse({
      full_name: 'X', email: 'x@y.local', password: 'aaaaaaaa', role: 'vendedor', hiper_usuario_id: '12',
    });
    expect(r.success && r.data.hiper_usuario_id).toBe(12);
  });
});
