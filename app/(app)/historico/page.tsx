import { PageHeader } from '@/components/layout/page-header';
import { PedidosList } from '@/components/pedidos-list';
import { ContentCard } from '@/components/layout/content-card';
import { createClient } from '@/lib/supabase/server';
import { CheckCircle2, DollarSign, UsersRound } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default async function HistoricoPage() {
  const supabase = await createClient();

  const { count: total } = await supabase
    .from('pedidos')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'finalizado');

  const { data: valores } = await supabase
    .from('pedidos')
    .select('valor_total, cliente_nome')
    .eq('status', 'finalizado')
    .limit(10000);

  const valorTotal = (valores ?? []).reduce(
    (s: number, p: { valor_total: number }) => s + Number(p.valor_total ?? 0),
    0,
  );
  const clientesUnicos = new Set(
    (valores ?? []).map((p: { cliente_nome: string }) => p.cliente_nome),
  ).size;

  return (
    <>
      <PageHeader title="Histórico" description="Pedidos finalizados e indicadores acumulados." />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Kpi
          icon={<CheckCircle2 className="h-5 w-5 text-status-finalizado" />}
          label="Pedidos finalizados"
          value={total ?? 0}
        />
        <Kpi
          icon={<DollarSign className="h-5 w-5 text-franzoni-orange" />}
          label="Valor faturado"
          value={valorTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
        />
        <Kpi
          icon={<UsersRound className="h-5 w-5 text-franzoni-navy" />}
          label="Clientes únicos"
          value={clientesUnicos}
        />
      </div>

      <PedidosList mode="historico" initialStatus="finalizado" showNewButton={false} />
    </>
  );
}

function Kpi({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
}) {
  return (
    <ContentCard className="p-5!">
      <div className="flex items-start gap-3">
        <div className="h-10 w-10 rounded-lg bg-franzoni-orange/10 flex items-center justify-center shrink-0">
          {icon}
        </div>
        <div className="min-w-0">
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">
            {label}
          </p>
          <p className="text-2xl font-heading font-bold text-franzoni-navy dark:text-white mt-0.5">
            {value}
          </p>
        </div>
      </div>
    </ContentCard>
  );
}
