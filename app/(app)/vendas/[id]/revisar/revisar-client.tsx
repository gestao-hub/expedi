'use client';

import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { PedidoForm } from '@/components/pedido-form';
import { Button } from '@/components/ui/button';
import type { PedidoFormInput } from '@/lib/validators/pedido';

export function RevisarClient({ id, defaults }: { id: string; defaults: PedidoFormInput }) {
  return (
    <>
      <PageHeader
        title="Revisar Pedido (Hiper)"
        description="Confira os dados, escolha o endereço de entrega e ajuste a observação antes de enviar para a logística."
        actions={
          <Link href={`/vendas/${id}`}>
            <Button variant="outline">
              <ArrowLeft className="h-4 w-4 mr-1" /> Voltar
            </Button>
          </Link>
        }
      />
      <PedidoForm defaultValues={defaults} mode="edit" pedidoId={id} />
    </>
  );
}
