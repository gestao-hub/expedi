/** Perfis disponíveis pra teste (deve bater com seed-users.ts da app). */
export type Profile = 'admin' | 'vendas1' | 'vendas2' | 'vendas3' | 'vendas4' | 'logistica';

export const PROFILES: { id: Profile; email: string; role: 'admin' | 'vendedor' | 'logistica' }[] = [
  { id: 'admin',     email: process.env.ADMIN_EMAIL     ?? 'admin@franzoni.local',     role: 'admin' },
  { id: 'vendas1',   email: process.env.VENDAS1_EMAIL   ?? 'vendas1@franzoni.local',   role: 'vendedor' },
  { id: 'vendas2',   email: process.env.VENDAS2_EMAIL   ?? 'vendas2@franzoni.local',   role: 'vendedor' },
  { id: 'vendas3',   email: process.env.VENDAS3_EMAIL   ?? 'vendas3@franzoni.local',   role: 'vendedor' },
  { id: 'vendas4',   email: process.env.VENDAS4_EMAIL   ?? 'vendas4@franzoni.local',   role: 'vendedor' },
  { id: 'logistica', email: process.env.LOGISTICA_EMAIL ?? 'logistica@franzoni.local', role: 'logistica' },
];

export const PASSWORD = process.env.SEED_PASSWORD ?? 'Franzoni@2026';

export const initialUrlFor = (role: 'admin' | 'vendedor' | 'logistica') =>
  role === 'admin' ? '/admin' : role === 'logistica' ? '/logistica' : '/vendas';

export const authStateFile = (id: Profile) => `./.auth/${id}.json`;
