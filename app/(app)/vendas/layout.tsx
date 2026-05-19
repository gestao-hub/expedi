import { requireRole } from '@/lib/auth/require-role';

/**
 * Gate de role: apenas admin e vendedor acessam /vendas e suas subrotas.
 * (logistica é redirecionada pra /logistica)
 */
export default async function VendasLayout({ children }: { children: React.ReactNode }) {
  await requireRole(['admin', 'vendedor']);
  return <>{children}</>;
}
