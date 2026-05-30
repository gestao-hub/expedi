import Link from 'next/link';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/layout/page-header';
import { ContentCard, ContentCardTitle } from '@/components/layout/content-card';

const BRL = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export default async function OsListPage() {
  const supabase = await createClient();
  const { data: ordens } = await supabase
    .from('ordens_servico')
    .select('id, documento_erp, cliente_nome, objeto, status, tecnico_nome, data_previsao, valor_total')
    .order('created_at', { ascending: false })
    .limit(200);
  const lista = ordens ?? [];

  return (
    <>
      <PageHeader title="Ordens de Serviço" description="OS sincronizadas do Hiper." />
      <ContentCard header={<ContentCardTitle>Ordens ({lista.length})</ContentCardTitle>}>
        {lista.length === 0 ? (
          <p className="text-sm text-muted-foreground italic py-8 text-center">
            Nenhuma ordem de serviço ainda. Elas aparecem aqui quando o agente sincronizar o Hiper.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="text-left px-3 py-2">OS</th>
                  <th className="text-left px-3 py-2">Cliente</th>
                  <th className="text-left px-3 py-2">Objeto</th>
                  <th className="text-left px-3 py-2">Técnico</th>
                  <th className="text-left px-3 py-2">Previsão</th>
                  <th className="text-left px-3 py-2">Status</th>
                  <th className="text-right px-3 py-2">Valor</th>
                </tr>
              </thead>
              <tbody>
                {lista.map((os) => (
                  <tr key={os.id} className="border-t hover:bg-muted/30">
                    <td className="px-3 py-2">
                      <Link href={`/os/${os.id}`} className="font-medium text-brand hover:underline">
                        {os.documento_erp ?? '—'}
                      </Link>
                    </td>
                    <td className="px-3 py-2">{os.cliente_nome}</td>
                    <td className="px-3 py-2">{os.objeto ?? '—'}</td>
                    <td className="px-3 py-2">{os.tecnico_nome ?? '—'}</td>
                    <td className="px-3 py-2">
                      {os.data_previsao ? format(new Date(os.data_previsao), 'dd/MM/yyyy', { locale: ptBR }) : '—'}
                    </td>
                    <td className="px-3 py-2 capitalize">{os.status}</td>
                    <td className="px-3 py-2 text-right font-mono">{BRL(Number(os.valor_total))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </ContentCard>
    </>
  );
}
