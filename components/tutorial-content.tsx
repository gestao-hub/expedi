import Link from 'next/link';
import {
  Upload,
  ListChecks,
  Send,
  Bell,
  Ban,
  Inbox,
  Play,
  Truck,
  Printer,
  CheckCircle2,
  LayoutDashboard,
  Users,
  History,
  Lightbulb,
  HelpCircle,
  type LucideIcon,
} from 'lucide-react';
import { ContentCard } from '@/components/layout/content-card';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { UserRole } from '@/lib/types';

type Step = {
  icon: LucideIcon;
  title: string;
  body: string;
  cta?: { label: string; href: string };
  tip?: string;
};

const STEPS_BY_ROLE: Record<UserRole, Step[]> = {
  vendedor: [
    {
      icon: Upload,
      title: 'Importe o PDF do pedido',
      body:
        'Em "Novo Pedido", arraste um ou vários PDFs gerados pelo ERP. O sistema extrai os dados automaticamente — cliente, endereço, itens, valores. Você pode soltar vários ao mesmo tempo: o lote processa em paralelo.',
      cta: { label: 'Abrir Novo Pedido', href: '/vendas/novo' },
      tip: 'Se o mesmo pedido (mesmo documento ERP) for enviado duas vezes, o sistema detecta e abre o existente em vez de duplicar.',
    },
    {
      icon: ListChecks,
      title: 'Revise os dados extraídos',
      body:
        'Confira o cliente, endereço, bairro, itens e total. Tudo é editável caso o parser não tenha pego algum campo. O bairro fica destacado (ele é a chave da rota da logística).',
      tip: 'Se preferir, salve como "Rascunho" e finalize depois — ele fica visível só pra você.',
    },
    {
      icon: Send,
      title: 'Envie para a logística',
      body:
        'Clique em "Enviar para Logística". O pedido vira pendente e aparece na fila da equipe de entrega em tempo real.',
    },
    {
      icon: Bell,
      title: 'Acompanhe o status',
      body:
        'Em "Meus Pedidos" você vê todos os seus pedidos com filtros (período, status, busca livre). Quando a logística inicia separação ou finaliza, a mudança chega ao vivo — sem precisar atualizar a página.',
      cta: { label: 'Ver meus pedidos', href: '/vendas' },
    },
    {
      icon: Ban,
      title: 'Cancele quando precisar',
      body:
        'Enquanto o pedido está em rascunho ou pendente, você pode cancelar pela tela de detalhe. Depois que entra em separação, só o admin cancela.',
    },
  ],

  logistica: [
    {
      icon: Inbox,
      title: 'A fila chega ordenada por bairro',
      body:
        'Em "Fila", os pedidos pendentes aparecem agrupados por bairro e data de entrega — o mais urgente primeiro. Tem aba pra cada status (Pendentes, Em separação, Finalizados) e atalhos de período (Hoje, Semana, Mês).',
      cta: { label: 'Ver fila', href: '/logistica' },
      tip: 'Clique em qualquer cabeçalho de coluna pra reordenar (cliente alfabético, valor maior primeiro, etc.).',
    },
    {
      icon: Play,
      title: 'Inicie a separação',
      body:
        'Abra o pedido. Clique em "Iniciar Separação" — isso avisa o vendedor em tempo real que vocês começaram. O pedido vai pra aba "Em separação".',
    },
    {
      icon: Truck,
      title: 'Preencha os dados da carga',
      body:
        'Pré-carga, motorista, veículo, km inicial/final, região, peso bruto/líquido, conferente e observações. Salve a qualquer momento — o pedido fica em separação até você finalizar.',
    },
    {
      icon: Printer,
      title: 'Imprima o Mapa de Carregamento',
      body:
        'Botão "Imprimir Mapa" abre uma versão A4 pronta para impressão, com casa, itens, totais e linha de assinatura do conferente. O navegador chama o diálogo de impressão automaticamente.',
    },
    {
      icon: CheckCircle2,
      title: 'Finalize ao entregar',
      body:
        'Quando o pedido é entregue, clique em "Marcar como Finalizado". Ele sai da fila ativa e vai pro histórico, contando nos KPIs.',
      cta: { label: 'Ver histórico', href: '/historico' },
    },
  ],

  admin: [
    {
      icon: LayoutDashboard,
      title: 'Dashboard com a visão geral',
      body:
        'Em "Dashboard" você vê quantidades por status (Pendentes, Em separação, Finalizados) e atalhos pras áreas principais. Boa primeira tela do dia.',
      cta: { label: 'Abrir Dashboard', href: '/admin' },
    },
    {
      icon: ListChecks,
      title: 'Veja todos os pedidos',
      body:
        'Em "Pedidos" você vê todos da empresa, não só os seus. Use os filtros (período/status/busca) e ordenação por coluna pra investigar.',
      cta: { label: 'Pedidos', href: '/vendas' },
    },
    {
      icon: Truck,
      title: 'Acompanhe a logística',
      body:
        'Em "Logística" você vê a mesma fila que a equipe de entrega vê. Útil pra resolver dúvidas, alterar dados de carga ou destravar pedidos parados.',
      cta: { label: 'Fila', href: '/logistica' },
    },
    {
      icon: Users,
      title: 'Gerencie usuários e roles',
      body:
        'Em "Usuários" você vê todos os profiles cadastrados e pode mudar o role de cada um (admin / vendedor / logística). Você não pode rebaixar o próprio role — guardrail de segurança.',
      cta: { label: 'Usuários', href: '/admin/usuarios' },
      tip: 'Pra criar usuários novos, rode o script `scripts/seed-users.ts` ou crie via Supabase Dashboard → Authentication.',
    },
    {
      icon: History,
      title: 'Histórico com KPIs',
      body:
        'Em "Histórico", além da lista dos finalizados, você vê total de pedidos, valor faturado acumulado e clientes únicos no período filtrado.',
      cta: { label: 'Histórico', href: '/historico' },
    },
  ],
};

const ROLE_HEADERS: Record<UserRole, { title: string; sub: string }> = {
  vendedor: {
    title: 'Como funciona — Vendas',
    sub:
      'Fluxo do vendedor: do PDF emitido pelo ERP até o pedido entregue. Tudo em tempo real.',
  },
  logistica: {
    title: 'Como funciona — Logística',
    sub:
      'Fluxo da equipe de entrega: da fila à entrega, com mapa impresso e dados de carga.',
  },
  admin: {
    title: 'Como funciona — Admin',
    sub:
      'Visão completa do sistema: pedidos, logística, usuários e histórico em um único lugar.',
  },
};

export function TutorialContent({ role }: { role: UserRole }) {
  const steps = STEPS_BY_ROLE[role];
  const header = ROLE_HEADERS[role];

  return (
    <div className="max-w-4xl mx-auto w-full space-y-6">
      {/* Intro */}
      <ContentCard className="p-6!">
        <div className="flex items-start gap-4">
          <div className="h-12 w-12 rounded-xl bg-franzoni-orange/15 flex items-center justify-center shrink-0">
            <Lightbulb className="h-6 w-6 text-franzoni-orange" />
          </div>
          <div>
            <h2 className="font-heading text-xl font-bold text-franzoni-navy dark:text-white">
              {header.title}
            </h2>
            <p className="text-sm text-muted-foreground mt-1 leading-relaxed">{header.sub}</p>
          </div>
        </div>
      </ContentCard>

      {/* Steps */}
      <ol className="space-y-4">
        {steps.map((step, i) => {
          const Icon = step.icon;
          return (
            <li key={i}>
              <ContentCard className="p-5!">
                <div className="flex gap-4">
                  <div className="flex flex-col items-center shrink-0">
                    <div className="h-9 w-9 rounded-full bg-franzoni-orange text-white flex items-center justify-center font-heading font-bold text-sm shadow-sm shadow-franzoni-orange/40">
                      {i + 1}
                    </div>
                    {i < steps.length - 1 && (
                      <div className="w-px flex-1 mt-2 bg-border/60" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0 pb-1">
                    <div className="flex items-center gap-2 mb-1.5">
                      <Icon className="h-4 w-4 text-franzoni-navy dark:text-franzoni-navy-100 shrink-0" />
                      <h3 className="font-heading font-semibold text-base text-foreground">
                        {step.title}
                      </h3>
                    </div>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      {step.body}
                    </p>
                    {step.tip && (
                      <p className="mt-3 text-xs px-3 py-2 rounded-md bg-franzoni-navy/5 dark:bg-white/5 border-l-2 border-franzoni-navy/40 text-foreground/80">
                        <span className="font-semibold text-franzoni-navy dark:text-franzoni-navy-100">
                          Dica:
                        </span>{' '}
                        {step.tip}
                      </p>
                    )}
                    {step.cta && (
                      <Link
                        href={step.cta.href}
                        className={cn(
                          buttonVariants({ variant: 'outline', size: 'sm' }),
                          'mt-3 text-xs',
                        )}
                      >
                        {step.cta.label} →
                      </Link>
                    )}
                  </div>
                </div>
              </ContentCard>
            </li>
          );
        })}
      </ol>

      {/* Glossário compartilhado */}
      <ContentCard className="p-5!">
        <div className="flex items-center gap-2 mb-3">
          <HelpCircle className="h-4 w-4 text-franzoni-orange" />
          <h3 className="font-heading font-semibold text-base">Glossário</h3>
        </div>
        <dl className="space-y-2.5 text-sm">
          <Term term="Mapa de Carregamento">
            Documento que a logística imprime e leva pra entrega. Tem cliente, endereço,
            itens da loja/depósito, totais, peso e linha de assinatura do conferente.
          </Term>
          <Term term="Documento ERP">
            Número do pedido como o ERP emitiu (ex.: <code className="text-xs">L4077</code>).
            Esse número é único — se você subir o mesmo PDF duas vezes, o sistema detecta.
          </Term>
          <Term term="Ponto de Retirada">
            Onde os produtos saem fisicamente — pode ser <strong>Loja</strong> ou{' '}
            <strong>Depósito</strong>. Um pedido pode ter dois pontos (ex.: parte da loja,
            parte do depósito).
          </Term>
          <Term term="Rascunho vs Pendente">
            <strong>Rascunho</strong> = só você vê, ainda não foi pra logística.{' '}
            <strong>Pendente</strong> = na fila aguardando separação.
          </Term>
          <Term term="Bairro destacado">
            A logística ordena os pedidos por bairro pra economizar deslocamento. Sempre
            confirme esse campo na revisão.
          </Term>
        </dl>
      </ContentCard>
    </div>
  );
}

function Term({ term, children }: { term: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col sm:flex-row gap-1 sm:gap-3">
      <dt className="font-semibold text-foreground sm:w-44 shrink-0">{term}</dt>
      <dd className="text-muted-foreground leading-relaxed">{children}</dd>
    </div>
  );
}
