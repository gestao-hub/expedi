import { PageHeader } from '@/components/layout/page-header';
import { ContentCard } from '@/components/layout/content-card';
import { VeiculosManager } from '@/components/veiculos-manager';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export default async function VeiculosPage() {
  const supabase = await createClient();
  const { data } = await supabase.from('veiculos').select('*').order('placa');
  return (
    <div className="flex flex-col flex-1 min-h-0 gap-4">
      <PageHeader
        title="Veículos"
        description="Frota da empresa. Os ativos aparecem como sugestão no formulário de baixa da logística."
      />
      <ContentCard variant="flush" className="flex flex-col flex-1 min-h-0">
        <div className="flex-1 overflow-y-auto min-h-0">
          <VeiculosManager veiculos={(data ?? []) as never} />
        </div>
      </ContentCard>
    </div>
  );
}
