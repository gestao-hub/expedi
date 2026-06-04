import { describe, it, expect } from 'vitest';
import { criarColaborador } from '../criar';
import type { CriarColaboradorInput } from '@/lib/validators/colaborador';

// Mock do admin client: createUser + from(...).update().eq() + from(...).upsert()
function mockAdmin(opts: { createError?: string; newId?: string } = {}) {
  const calls: {
    updates: Record<string, unknown>[];
    upserts: { table: string; row: Record<string, unknown> }[];
    createdWith?: unknown;
  } = { updates: [], upserts: [] };
  const admin = {
    auth: {
      admin: {
        async createUser(payload: unknown) {
          calls.createdWith = payload;
          if (opts.createError) return { data: { user: null }, error: { message: opts.createError } };
          return { data: { user: { id: opts.newId ?? 'NEW1' } }, error: null };
        },
      },
    },
    from(table: string) {
      return {
        update(patch: Record<string, unknown>) {
          calls.updates.push(patch);
          return { eq: async () => ({ error: null }) };
        },
        async upsert(row: Record<string, unknown>) {
          calls.upserts.push({ table, row });
          return { error: null };
        },
      };
    },
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { admin: admin as any, calls };
}

const base: CriarColaboradorInput = {
  full_name: 'Gustavo', email: 'gustavo@franzoni.local', password: 'Franzoni@2026', role: 'vendedor',
};

describe('criarColaborador', () => {
  it('cria usuário + atribui empresa/role/ativo', async () => {
    const { admin, calls } = mockAdmin({ newId: 'U7' });
    const r = await criarColaborador(admin, 'E1', { ...base, role: 'logistica' });
    expect(r).toEqual({ ok: true, id: 'U7' });
    expect(calls.updates[0]).toEqual({ empresa_id: 'E1', role: 'logistica', full_name: 'Gustavo', ativo: true });
  });
  it('vendedor com hiper_usuario_id → upsert no mapa', async () => {
    const { admin, calls } = mockAdmin({ newId: 'U8' });
    await criarColaborador(admin, 'E1', { ...base, hiper_usuario_id: 12, hiper_usuario_nome: 'GUSTAVO' });
    expect(calls.upserts[0]).toEqual({
      table: 'hiper_vendedor_map',
      row: { empresa_id: 'E1', hiper_usuario_id: 12, vendedor_id: 'U8', hiper_usuario_nome: 'GUSTAVO' },
    });
  });
  it('sem hiper_usuario_id → NÃO faz upsert no mapa', async () => {
    const { admin, calls } = mockAdmin();
    await criarColaborador(admin, 'E1', base);
    expect(calls.upserts).toHaveLength(0);
  });
  it('email duplicado → mensagem amigável', async () => {
    const { admin } = mockAdmin({ createError: 'A user with this email address has already been registered' });
    const r = await criarColaborador(admin, 'E1', base);
    expect(r).toEqual({ error: 'Já existe um colaborador com esse email' });
  });
});
