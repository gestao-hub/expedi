import { describe, it, expect } from 'vitest';
import { formatTituloAlerta } from './titulo';

describe('formatTituloAlerta', () => {
  it('singular para 1', () => {
    expect(formatTituloAlerta(1)).toBe('🔴 1 novo pedido');
  });
  it('plural para >1', () => {
    expect(formatTituloAlerta(3)).toBe('🔴 3 novos pedidos');
  });
});
