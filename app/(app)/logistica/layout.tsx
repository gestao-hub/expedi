import { requireRole } from '@/lib/auth/require-role';

/**
 * Gate de role: apenas admin e logistica acessam /logistica e suas subrotas.
 * (vendedor é redirecionado pra /vendas)
 */
export default async function LogisticaLayout({ children }: { children: React.ReactNode }) {
  await requireRole(['admin', 'logistica']);
  return <>{children}</>;
}
