import { PedidosList } from '@/components/pedidos-list';
import { Card, CardContent } from '@/components/ui/card';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export default async function HistoricoPage() {
  const supabase = await createClient();

  // KPIs
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
  const clientesUnicos = new Set((valores ?? []).map((p: { cliente_nome: string }) => p.cliente_nome)).size;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold">Histórico</h2>
        <p className="text-sm text-muted-foreground">Pedidos finalizados.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Kpi label="Pedidos finalizados" value={total ?? 0} />
        <Kpi
          label="Valor total faturado"
          value={valorTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
        />
        <Kpi label="Clientes únicos" value={clientesUnicos} />
      </div>

      <PedidosList mode="historico" initialStatus="finalizado" showNewButton={false} />
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string | number }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <p className="text-xs uppercase tracking-wider text-muted-foreground">{label}</p>
        <p className="text-2xl font-bold text-franzoni-navy mt-1">{value}</p>
      </CardContent>
    </Card>
  );
}
