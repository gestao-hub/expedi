import { PageHeader } from '@/components/layout/page-header';
import { ContentCard } from '@/components/layout/content-card';
import { MotoristasManager } from '@/components/motoristas-manager';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export default async function MotoristasPage() {
  const supabase = await createClient();
  const { data } = await supabase.from('motoristas').select('*').order('nome');
  return (
    <div className="flex flex-col flex-1 min-h-0 gap-4">
      <PageHeader
        title="Motoristas"
        description="Cadastro dos motoristas. Os ativos aparecem como sugestão no formulário de baixa da logística."
      />
      <ContentCard variant="flush" className="flex flex-col flex-1 min-h-0">
        <div className="flex-1 overflow-y-auto min-h-0">
          <MotoristasManager motoristas={(data ?? []) as never} />
        </div>
      </ContentCard>
    </div>
  );
}
