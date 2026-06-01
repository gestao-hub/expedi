import { describe, it, expect } from 'vitest';
import { rotuloEntrega } from '../entrega';
const hoje = new Date('2026-06-01T12:00:00');
describe('rotuloEntrega', () => {
  it('hoje / amanhã / atrasado', () => {
    expect(rotuloEntrega('2026-06-01', null, hoje)).toBe('01/06 (hoje)');
    expect(rotuloEntrega('2026-06-02', null, hoje)).toBe('02/06 (amanhã)');
    expect(rotuloEntrega('2026-05-30', null, hoje)).toBe('30/05 (atrasado)');
  });
  it('data distante = só a data, sem dica', () => {
    expect(rotuloEntrega('2026-06-20', null, hoje)).toBe('20/06');
  });
  it('janela início–fim', () => {
    expect(rotuloEntrega('2026-06-02', '2026-06-01', hoje)).toBe('01/06 – 02/06 (amanhã)');
  });
  it('sem data', () => {
    expect(rotuloEntrega(null, null, hoje)).toBe('A definir');
  });
});
