import { redirect } from 'next/navigation';
import { getAuthUserCached, getProfileCached } from '@/lib/auth/cached';
import { Sidebar } from '@/components/layout/sidebar';
import { MobileHeader } from '@/components/layout/mobile-header';
import { UserProvider } from '@/components/providers/user-provider';
import { AlertasCenter } from '@/components/alertas/alertas-center';
import { AlertasProvider } from '@/components/alertas/alertas-provider';
import { getEmpresaAtual } from '@/lib/empresa/current';
import { brandVars } from '@/lib/empresa/brand-vars';
import type { Profile } from '@/lib/types';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getAuthUserCached();
  if (!user) redirect('/login');

  const profile = await getProfileCached(user.id);
  if (!profile) redirect('/auth/signout');

  const empresa = await getEmpresaAtual();

  return (
    <UserProvider profile={profile as Profile}>
      <div className="flex h-screen overflow-hidden" style={brandVars(empresa?.cor_primaria)}>
        <Sidebar empresa={empresa} />
        <AlertasProvider>
          <div className="flex-1 flex flex-col min-w-0">
            <MobileHeader empresa={empresa} />
            <div className="hidden md:flex items-center justify-end px-8 pt-4">
              <AlertasCenter />
            </div>
            <main className="flex-1 min-h-0 overflow-y-auto px-4 md:px-8 py-6 md:py-8">
              <div className="mx-auto max-w-7xl w-full flex flex-col gap-6 min-h-[calc(100vh-3rem-4rem)] md:min-h-[calc(100vh-4rem)]">
                {children}
              </div>
            </main>
          </div>
        </AlertasProvider>
      </div>
    </UserProvider>
  );
}
