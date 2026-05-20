'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { X, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { useConfirm } from '@/components/providers/confirm-provider';
import { cancelarPedidoAction } from '@/app/(app)/vendas/actions';

export function CancelarPedidoButton({ id }: { id: string }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  const confirm = useConfirm();

  return (
    <Button
      variant="outline"
      className="text-destructive hover:text-destructive border-destructive/30"
      disabled={pending}
      onClick={async () => {
        const ok = await confirm({
          title: 'Cancelar este pedido?',
          description: 'O pedido sairá da fila e ficará marcado como cancelado.',
          confirmText: 'Cancelar pedido',
          cancelText: 'Voltar',
          variant: 'destructive',
        });
        if (!ok) return;
        start(async () => {
          const r = await cancelarPedidoAction(id);
          if ('error' in r) {
            toast.error(r.error);
            return;
          }
          toast.success('Pedido cancelado');
          router.refresh();
        });
      }}
    >
      {pending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <X className="h-4 w-4 mr-1" />}
      Cancelar Pedido
    </Button>
  );
}
