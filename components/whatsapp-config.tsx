'use client';

import { useState, useTransition, useRef, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Smartphone, Loader2, Power } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ContentCard, ContentCardTitle } from '@/components/layout/content-card';
import {
  conectarWhatsappAction,
  statusWhatsappAction,
  desconectarWhatsappAction,
  type ConexaoResult,
} from '@/app/(app)/configuracoes/actions';

export type ComunicacaoRow = {
  id: string; canal: string; tipo: string; destino: string; status: string;
  agendada_para: string; enviada_em: string | null; erro: string | null;
};

const TIPO_LABEL: Record<string, string> = {
  autorizacao: 'Autorização', pronto: 'Pronto p/ retirada', lembrete_manutencao: 'Lembrete de manutenção',
};
const STATUS_VARIANT: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  pendente: 'secondary', enviada: 'default', falha: 'destructive', cancelada: 'outline',
};

function qrSrc(qr: string) {
  return qr.startsWith('data:') ? qr : `data:image/png;base64,${qr}`;
}

export function WhatsappConfig({
  conectadoInicial,
  comunicacoes,
}: {
  conectadoInicial: boolean;
  comunicacoes: ComunicacaoRow[];
}) {
  const [pending, start] = useTransition();
  const [conectado, setConectado] = useState(conectadoInicial);
  const [qr, setQr] = useState<string | null>(null);
  const [pair, setPair] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(conectadoInicial ? 'connected' : null);
  const poll = useRef<ReturnType<typeof setInterval> | null>(null);

  const pararPolling = useCallback(() => {
    if (poll.current) { clearInterval(poll.current); poll.current = null; }
  }, []);

  const aplicar = useCallback((r: ConexaoResult) => {
    if ('error' in r) { toast.error(r.error); return; }
    setStatus(r.status);
    setConectado(r.conectado);
    setQr(r.qrcode);
    setPair(r.paircode);
    if (r.conectado) {
      setQr(null); setPair(null); pararPolling();
      toast.success('WhatsApp conectado!');
    }
  }, [pararPolling]);

  // polling enquanto há QR e ainda não conectou
  useEffect(() => {
    if (qr && !conectado && !poll.current) {
      poll.current = setInterval(async () => {
        const r = await statusWhatsappAction();
        aplicar(r);
      }, 4000);
    }
    return pararPolling;
  }, [qr, conectado, aplicar, pararPolling]);

  function conectar() {
    start(async () => {
      const r = await conectarWhatsappAction();
      aplicar(r);
      if (!('error' in r) && !r.qrcode && !r.paircode && !r.conectado) {
        toast.message('Sem QR retornado — tente novamente em alguns segundos.');
      }
    });
  }
  function desconectar() {
    start(async () => {
      const r = await desconectarWhatsappAction();
      if ('error' in r) { toast.error(r.error); return; }
      setConectado(false); setStatus('disconnected'); setQr(null); setPair(null);
      toast.success('WhatsApp desconectado.');
    });
  }

  const fmt = (s: string | null) => (s ? format(new Date(s), 'dd/MM/yy HH:mm', { locale: ptBR }) : '—');

  return (
    <>
      <ContentCard header={<ContentCardTitle>WhatsApp</ContentCardTitle>}>
        <div className="flex items-center gap-3 mb-4">
          <Smartphone className="h-5 w-5 text-muted-foreground" />
          <div className="flex-1">
            <p className="text-sm font-medium">Conexão</p>
            <p className="text-xs text-muted-foreground">
              {conectado ? 'Seu WhatsApp está conectado e pronto para notificar clientes.'
                         : 'Conecte um número de WhatsApp para enviar notificações automáticas.'}
            </p>
          </div>
          <Badge variant={conectado ? 'default' : 'secondary'}>
            {conectado ? 'Conectado' : (status ?? 'Desconectado')}
          </Badge>
        </div>

        {!conectado && (
          <div className="space-y-3">
            <Button onClick={conectar} disabled={pending}>
              {pending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Smartphone className="h-4 w-4 mr-1" />}
              {qr ? 'Gerar novo QR' : 'Conectar WhatsApp'}
            </Button>

            {qr && (
              <div className="rounded-lg border p-4 inline-block bg-white">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={qrSrc(qr)} alt="QR Code do WhatsApp" className="h-56 w-56 object-contain" />
                <p className="text-xs text-center text-muted-foreground mt-2 max-w-56">
                  Abra o WhatsApp → Aparelhos conectados → Conectar aparelho e aponte para o QR.
                </p>
              </div>
            )}
            {!qr && pair && (
              <p className="text-sm">
                Código de pareamento: <span className="font-mono font-bold text-lg">{pair}</span>
              </p>
            )}
            {qr && (
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <Loader2 className="h-3 w-3 animate-spin" /> Aguardando leitura do QR…
              </p>
            )}
          </div>
        )}

        {conectado && (
          <Button variant="outline" size="sm" onClick={desconectar} disabled={pending}>
            <Power className="h-4 w-4 mr-1" /> Desconectar
          </Button>
        )}
      </ContentCard>

      <ContentCard header={<ContentCardTitle>Comunicação enviada ({comunicacoes.length})</ContentCardTitle>}>
        {comunicacoes.length === 0 ? (
          <p className="text-sm text-muted-foreground italic py-6 text-center">
            Nenhuma mensagem enviada ainda. As notificações das OS aparecem aqui.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="text-muted-foreground text-left bg-muted/40">
                <tr>
                  <th className="px-3 py-2">Quando</th>
                  <th className="px-3 py-2">Tipo</th>
                  <th className="px-3 py-2">Canal</th>
                  <th className="px-3 py-2">Destino</th>
                  <th className="px-3 py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {comunicacoes.map((n) => (
                  <tr key={n.id} className="border-t align-top">
                    <td className="px-3 py-2 whitespace-nowrap">{fmt(n.enviada_em ?? n.agendada_para)}</td>
                    <td className="px-3 py-2">{TIPO_LABEL[n.tipo] ?? n.tipo}</td>
                    <td className="px-3 py-2 capitalize">{n.canal}</td>
                    <td className="px-3 py-2 font-mono">{n.destino}</td>
                    <td className="px-3 py-2">
                      <Badge variant={STATUS_VARIANT[n.status] ?? 'outline'}>{n.status}</Badge>
                      {n.status === 'falha' && n.erro && (
                        <span className="block text-[10px] text-destructive mt-0.5 max-w-[220px] truncate" title={n.erro}>
                          {n.erro}
                        </span>
                      )}
                    </td>
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
