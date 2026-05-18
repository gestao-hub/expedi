import { PageHeader } from '@/components/layout/page-header';
import { PedidosList } from '@/components/pedidos-list';

export default function VendasPage() {
  return (
    <>
      <PageHeader
        title="Meus Pedidos"
        description="Pedidos criados por você. As atualizações de status da logística chegam em tempo real."
      />
      <PedidosList mode="vendas" />
    </>
  );
}
