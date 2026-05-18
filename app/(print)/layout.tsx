import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

/**
 * Layout sem sidebar/topbar — usado pela view de impressão.
 * Faz o gate de autenticação mas renderiza só os children.
 */
export default async function PrintLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  return (
    <div className="bg-white min-h-screen">
      {children}
    </div>
  );
}
