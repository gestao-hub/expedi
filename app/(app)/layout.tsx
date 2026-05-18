import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { Sidebar } from '@/components/layout/sidebar';
import { MobileHeader } from '@/components/layout/mobile-header';
import { UserProvider } from '@/components/providers/user-provider';
import type { Profile } from '@/lib/types';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single();

  if (!profile) redirect('/auth/signout');

  return (
    <UserProvider profile={profile as Profile}>
      <div className="flex flex-1 min-h-screen">
        <Sidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <MobileHeader />
          <main className="flex-1 overflow-y-auto px-4 md:px-8 py-6 md:py-8">
            <div className="mx-auto max-w-7xl space-y-6">{children}</div>
          </main>
        </div>
      </div>
    </UserProvider>
  );
}
