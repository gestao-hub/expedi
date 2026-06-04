import { describe, it, expect } from 'vitest';
import { criarColaborador } from '../criar';
import type { CriarColaboradorInput } from '@/lib/validators/colaborador';

// Mock do admin client: createUser/deleteUser + from(...).select().eq().eq().maybeSingle()
// (checagem de conflito Hiper) + update().eq() + upsert().
function mockAdmin(
  opts: {
    createError?: string;
    newId?: string;
    existingMap?: { vendedor_id: string } | null; // mapa Hiper já existente
    updateError?: string; // e2 (profiles)
    upsertError?: string; // e3 (hiper_vendedor_map)
  } = {},
) {
  const calls: {
    updates: Record<string, unknown>[];
    upserts: { table: string; row: Record<string, unknown> }[];
    deleted: string[];
    createdWith?: unknown;
    mapLookups: number;
  } = { updates: [], upserts: [], deleted: [], mapLookups: 0 };
  const admin = {
    auth: {
      admin: {
        async createUser(payload: unknown) {
          calls.createdWith = payload;
          if (opts.createError) return { data: { user: null }, error: { message: opts.createError } };
          return { data: { user: { id: opts.newId ?? 'NEW1' } }, error: null };
        },
        async deleteUser(id: string) {
          calls.deleted.push(id);
          return { data: {}, error: null };
        },
      },
    },
    from(table: string) {
      const builder: Record<string, unknown> = {
        select() { return builder; },
        eq() { return builder; },
        async maybeSingle() {
          calls.mapLookups++;
          return { data: opts.existingMap ?? null };
        },
        update(patch: Record<string, unknown>) {
          calls.updates.push(patch);
          return { eq: async () => ({ error: opts.updateError ? { message: opts.updateError } : null }) };
        },
        async upsert(row: Record<string, unknown>) {
          calls.upserts.push({ table, row });
          return { error: opts.upsertError ? { message: opts.upsertError } : null };
        },
      };
      return builder;
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
    expect(calls.deleted).toHaveLength(0);
  });

  it('vendedor com hiper_usuario_id livre → upsert no mapa', async () => {
    const { admin, calls } = mockAdmin({ newId: 'U8', existingMap: null });
    await criarColaborador(admin, 'E1', { ...base, hiper_usuario_id: 12, hiper_usuario_nome: 'GUSTAVO' });
    expect(calls.upserts[0]).toEqual({
      table: 'hiper_vendedor_map',
      row: { empresa_id: 'E1', hiper_usuario_id: 12, vendedor_id: 'U8', hiper_usuario_nome: 'GUSTAVO' },
    });
  });

  it('hiper_usuario_id JÁ vinculado a outro vendedor → rejeita ANTES de criar usuário', async () => {
    const { admin, calls } = mockAdmin({ existingMap: { vendedor_id: 'OUTRO' } });
    const r = await criarColaborador(admin, 'E1', { ...base, hiper_usuario_id: 12 });
    expect('error' in r && r.error).toMatch(/já está vinculado a outro vendedor/);
    expect(calls.createdWith).toBeUndefined(); // nem chegou a criar o usuário
    expect(calls.upserts).toHaveLength(0);
  });

  it('sem hiper_usuario_id → NÃO consulta nem faz upsert no mapa', async () => {
    const { admin, calls } = mockAdmin();
    await criarColaborador(admin, 'E1', base);
    expect(calls.mapLookups).toBe(0);
    expect(calls.upserts).toHaveLength(0);
  });

  it('email duplicado → mensagem amigável', async () => {
    const { admin } = mockAdmin({ createError: 'A user with this email address has already been registered' });
    const r = await criarColaborador(admin, 'E1', base);
    expect(r).toEqual({ error: 'Já existe um colaborador com esse email' });
  });

  it('falha no update do profile → reverte (deleteUser) e retorna erro', async () => {
    const { admin, calls } = mockAdmin({ newId: 'U9', updateError: 'boom', existingMap: null });
    const r = await criarColaborador(admin, 'E1', { ...base, hiper_usuario_id: 5 });
    expect('error' in r && r.error).toMatch(/Falha ao atribuir empresa\/cargo/);
    expect(calls.deleted).toEqual(['U9']); // usuário órfão revertido
    expect(calls.upserts).toHaveLength(0); // não chegou no mapa
  });

  it('falha no mapa Hiper (não-fatal) → ok com aviso, usuário mantido', async () => {
    const { admin, calls } = mockAdmin({ newId: 'U10', existingMap: null, upsertError: 'fk' });
    const r = await criarColaborador(admin, 'E1', { ...base, hiper_usuario_id: 7 });
    expect('ok' in r && r.ok).toBe(true);
    expect('aviso' in r && r.aviso).toMatch(/vínculo com o Hiper falhou/);
    expect(calls.deleted).toHaveLength(0); // colaborador NÃO é revertido (já é válido)
  });
});
