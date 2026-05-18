import { cn } from '@/lib/utils';
import type { PedidoStatus } from '@/lib/types';

const LABELS: Record<PedidoStatus, string> = {
  rascunho:     'Rascunho',
  pendente:     'Pendente',
  em_separacao: 'Em separação',
  finalizado:   'Finalizado',
  cancelado:    'Cancelado',
};

const STYLES: Record<PedidoStatus, string> = {
  rascunho:     'bg-status-rascunho/12     text-status-rascunho     ring-status-rascunho/25',
  pendente:     'bg-status-pendente/12     text-status-pendente     ring-status-pendente/25',
  em_separacao: 'bg-status-separacao/12    text-status-separacao    ring-status-separacao/25',
  finalizado:   'bg-status-finalizado/15   text-status-finalizado   ring-status-finalizado/30',
  cancelado:    'bg-status-cancelado/12    text-status-cancelado    ring-status-cancelado/25',
};

const DOT_STYLES: Record<PedidoStatus, string> = {
  rascunho:     'bg-status-rascunho',
  pendente:     'bg-status-pendente',
  em_separacao: 'bg-status-separacao',
  finalizado:   'bg-status-finalizado',
  cancelado:    'bg-status-cancelado',
};

export function StatusBadge({ status, className }: { status: PedidoStatus; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium',
        'ring-1 ring-inset',
        STYLES[status],
        className,
      )}
    >
      <span
        className={cn(
          'h-1.5 w-1.5 rounded-full',
          DOT_STYLES[status],
          status === 'em_separacao' && 'animate-pulse',
        )}
      />
      {LABELS[status]}
    </span>
  );
}
