import { describe, it, expect } from 'vitest';
import { diffEmpresas, fanout } from '../events.mjs';

describe('diffEmpresas', () => {
  it('retorna empresas cujo max(updated_at) avançou', () => {
    const prev = { E1: '2026-01-01T00:00:00Z', E2: '2026-01-01T00:00:00Z' };
    const atual = { E1: '2026-01-02T00:00:00Z', E2: '2026-01-01T00:00:00Z', E3: '2026-01-05T00:00:00Z' };
    expect(diffEmpresas(prev, atual).sort()).toEqual(['E1']); // E1 avançou; E3 é nova (não dispara); E2 igual
  });
  it('primeira aparição de uma empresa NÃO dispara', () => {
    expect(diffEmpresas({}, { E1: '2026-01-01T00:00:00Z' })).toEqual([]);
  });
});

describe('fanout', () => {
  it('entrega só aos clientes da empresa', () => {
    const escritos = [];
    const mk = (empresaId) => ({ empresaId, res: { write: (s) => escritos.push([empresaId, s]) } });
    const clients = [mk('E1'), mk('E2'), mk('E1')];
    const n = fanout(clients, 'E1');
    expect(n).toBe(2);
    expect(escritos.every(([e]) => e === 'E1')).toBe(true);
    expect(escritos[0][1]).toContain('event: changed');
  });
  it('cliente que lança no write não derruba o fanout', () => {
    const ok = [];
    const clients = [
      { empresaId: 'E1', res: { write: () => { throw new Error('gone'); } } },
      { empresaId: 'E1', res: { write: (s) => ok.push(s) } },
    ];
    const n = fanout(clients, 'E1');
    expect(n).toBe(1);
    expect(ok).toHaveLength(1);
  });
});
