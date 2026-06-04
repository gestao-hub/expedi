import { describe, it, expect } from 'vitest';
import { desativarColaborador, reativarColaborador } from '../desativar';

// Mock admin: select().eq().eq().maybeSingle() (checagem de empresa) + updateUserById + update().eq().eq()
function mockAdmin(alvo: { id: string } | null, opts: { updateError?: string } = {}) {
  const calls: { bans: { id: string; ban?: string }[]; updates: Record<string, unknown>[] } = {
    bans: [], updates: [],
  };
  const admin = {
    auth: {
      admin: {
        async updateUserById(id: string, attrs: { ban_duration?: string }) {
          calls.bans.push({ id, ban: attrs.ban_duration });
          return { error: null };
        },
      },
    },
    from() {
      const builder: Record<string, unknown> = {
        select() { return builder; },
        eq() { return builder; },
        async maybeSingle() { return { data: alvo }; },
        update(patch: Record<string, unknown>) {
          calls.updates.push(patch);
          return { eq: () => ({ eq: async () => ({ error: opts.updateError ? { message: opts.updateError } : null }) }) };
        },
      };
      return builder;
    },
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { admin: admin as any, calls };
}

describe('desativarColaborador', () => {
  it('alvo da empresa → ban perpétuo + ativo=false', async () => {
    const { admin, calls } = mockAdmin({ id: 'U1' });
    const r = await desativarColaborador(admin, { id: 'U1', empresaId: 'E1' });
    expect(r).toEqual({ ok: true });
    expect(calls.bans[0].id).toBe('U1');
    expect(calls.bans[0].ban).toBe('876000h');
    expect(calls.updates[0]).toEqual({ ativo: false });
  });
  it('alvo NÃO é da empresa → erro, sem ban', async () => {
    const { admin, calls } = mockAdmin(null);
    const r = await desativarColaborador(admin, { id: 'U1', empresaId: 'E1' });
    expect(r).toEqual({ error: 'Colaborador não encontrado nesta empresa' });
    expect(calls.bans).toHaveLength(0);
  });
  it('falha ao gravar ativo → reverte o ban (rollback) e retorna erro', async () => {
    const { admin, calls } = mockAdmin({ id: 'U1' }, { updateError: 'boom' });
    const r = await desativarColaborador(admin, { id: 'U1', empresaId: 'E1' });
    expect('error' in r && r.error).toBe('boom');
    // 1º ban perpétuo, depois rollback com 'none'
    expect(calls.bans.map((b) => b.ban)).toEqual(['876000h', 'none']);
  });
});

describe('reativarColaborador', () => {
  it('alvo da empresa → remove ban + ativo=true', async () => {
    const { admin, calls } = mockAdmin({ id: 'U1' });
    const r = await reativarColaborador(admin, { id: 'U1', empresaId: 'E1' });
    expect(r).toEqual({ ok: true });
    expect(calls.bans[0].ban).toBe('none');
    expect(calls.updates[0]).toEqual({ ativo: true });
  });
  it('falha ao gravar ativo → re-bane (rollback) e retorna erro', async () => {
    const { admin, calls } = mockAdmin({ id: 'U1' }, { updateError: 'boom' });
    const r = await reativarColaborador(admin, { id: 'U1', empresaId: 'E1' });
    expect('error' in r && r.error).toBe('boom');
    // 1º unban, depois rollback re-banindo
    expect(calls.bans.map((b) => b.ban)).toEqual(['none', '876000h']);
  });
});
