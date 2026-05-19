import { requireRole } from '@/lib/auth/require-role';

/**
 * Gate de role: apenas admin acessa /admin e suas subrotas.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireRole(['admin']);
  return <>{children}</>;
}
