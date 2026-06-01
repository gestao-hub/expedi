// lib/pedidos/entrega.ts
import { format, differenceInCalendarDays, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';

/** Rótulo destacado da entrega: "02/06 (amanhã)", "01/06 – 02/06 (amanhã)", "20/06", "A definir".
 *  `hoje` é injetado p/ testabilidade (sem Date.now interno). */
export function rotuloEntrega(
  dataEntrega: string | null | undefined,
  dataInicio: string | null | undefined,
  hoje: Date,
): string {
  if (!dataEntrega) return 'A definir';
  const fim = parseISO(dataEntrega);
  const base = dataInicio && dataInicio !== dataEntrega
    ? `${format(parseISO(dataInicio), 'dd/MM')} – ${format(fim, 'dd/MM')}`
    : format(fim, 'dd/MM');
  const diff = differenceInCalendarDays(fim, hoje);
  let hint = '';
  if (diff < 0) hint = 'atrasado';
  else if (diff === 0) hint = 'hoje';
  else if (diff === 1) hint = 'amanhã';
  else if (diff <= 6) hint = format(fim, 'EEEE', { locale: ptBR });
  return hint ? `${base} (${hint})` : base;
}
