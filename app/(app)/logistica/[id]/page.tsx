import { notFound } from 'next/navigation';
import Link from 'next/link';
import { Printer, ArrowLeft } from 'lucide-react';
import { buttonVariants } from '@/components/ui/button';
import { MapaCarregamento, type PontoComItens } from '@/components/mapa-carregamento';
import { createClient } from '@/lib/supabase/server';
import { cn } from '@/lib/utils';
import type { PedidoItem } from '@/lib/types';
import { BaixaForm } from './baixa-form';
import { emptyLogistica } from '@/lib/validators/logistica';

export default async function LogisticaDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: pedido }, { data: pontosRaw }, { data: logistica }] = await Promise.all([
    supabase.from('pedidos').select('*').eq('id', id).single(),
    supabase
      .from('pedido_pontos_retirada')
      .select('*, itens:pedido_itens(*)')
      .eq('pedido_id', id)
      .order('ordem'),
    supabase.from('pedido_logistica').select('*').eq('pedido_id', id).maybeSingle(),
  ]);

  if (!pedido) notFound();

  const vendedor = pedido.vendedor_id
    ? (await supabase.from('profiles').select('full_name, email').eq('id', pedido.vendedor_id).single()).data
    : null;

  const pontos = (pontosRaw ?? []).map((p) => ({
    ...p,
    itens: ((p.itens ?? []) as PedidoItem[]).sort(
      (a: PedidoItem, b: PedidoItem) => (a.ordem ?? 0) - (b.ordem ?? 0),
    ),
  })) as unknown as PontoComItens[];

  const defaults = logistica
    ? {
        pre_carga: logistica.pre_carga,
        motorista: logistica.motorista,
        veiculo: logistica.veiculo,
        km_inicial: logistica.km_inicial,
        km_final: logistica.km_final,
        regiao: logistica.regiao,
        peso_bruto_total: logistica.peso_bruto_total,
        peso_liquido_total: logistica.peso_liquido_total,
        conferente: logistica.conferente,
        observacoes: logistica.observacoes,
      }
    : emptyLogistica();

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Link
            href="/logistica"
            className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }))}
          >
            <ArrowLeft className="h-4 w-4 mr-1" /> Fila
          </Link>
          <h2 className="text-2xl font-semibold">
            <span className="text-muted-foreground font-mono">#{pedido.numero_mapa}</span>
          </h2>
        </div>
        <Link
          href={`/imprimir/${id}`}
          target="_blank"
          className={cn(buttonVariants({ variant: 'outline' }))}
        >
          <Printer className="h-4 w-4 mr-1" /> Imprimir Mapa
        </Link>
      </div>

      <MapaCarregamento
        pedido={pedido}
        pontos={pontos}
        logistica={logistica ?? undefined}
        vendedor={vendedor}
      />

      <BaixaForm pedidoId={id} status={pedido.status} defaultValues={defaults} />
    </div>
  );
}
