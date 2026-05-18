import Link from 'next/link';
import { Package, TruckIcon, History, Users } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { ContentCard } from '@/components/layout/content-card';
import { createClient } from '@/lib/supabase/server';
import { cn } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export default async function AdminDashboard() {
  const supabase = await createClient();

  const [pedidosCount, pendentesCount, separacaoCount, finalizadosCount, usuariosCount] =
    await Promise.all([
      supabase.from('pedidos').select('id', { count: 'exact', head: true }),
      supabase.from('pedidos').select('id', { count: 'exact', head: true }).eq('status', 'pendente'),
      supabase
        .from('pedidos')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'em_separacao'),
      supabase
        .from('pedidos')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'finalizado'),
      supabase.from('profiles').select('id', { count: 'exact', head: true }),
    ]);

  const stats = [
    { label: 'Total de pedidos', value: pedidosCount.count ?? 0,    accent: 'text-foreground' },
    { label: 'Pendentes',        value: pendentesCount.count ?? 0,  accent: 'text-status-pendente' },
    { label: 'Em separação',     value: separacaoCount.count ?? 0,  accent: 'text-status-separacao' },
    { label: 'Finalizados',      value: finalizadosCount.count ?? 0, accent: 'text-status-finalizado' },
  ];

  const shortcuts = [
    { label: 'Ver Pedidos',   href: '/vendas',         icon: Package,    color: 'text-franzoni-orange' },
    { label: 'Fila Logística', href: '/logistica',     icon: TruckIcon,  color: 'text-franzoni-navy' },
    { label: 'Histórico',     href: '/historico',      icon: History,    color: 'text-status-finalizado' },
    { label: 'Usuários',      href: '/admin/usuarios', icon: Users,      color: 'text-franzoni-orange' },
  ];

  return (
    <>
      <PageHeader
        title="Painel Admin"
        description="Visão geral do sistema. Use os atalhos para navegar."
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((s) => (
          <ContentCard key={s.label} className="p-5!">
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">
              {s.label}
            </p>
            <p
              className={cn(
                'text-3xl font-heading font-bold mt-1',
                s.accent,
              )}
            >
              {s.value}
            </p>
          </ContentCard>
        ))}
      </div>

      <div>
        <h2 className="text-sm font-semibold text-muted-foreground mb-3 uppercase tracking-wider">
          Atalhos
        </h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {shortcuts.map((s) => {
            const Icon = s.icon;
            return (
              <Link
                key={s.href}
                href={s.href}
                className="group glass-card rounded-xl p-4 flex items-center gap-3 transition-all hover:shadow-lg hover:-translate-y-0.5"
              >
                <div className="h-10 w-10 rounded-lg bg-white/60 dark:bg-white/5 flex items-center justify-center group-hover:scale-110 transition-transform">
                  <Icon className={cn('h-5 w-5', s.color)} />
                </div>
                <span className="font-medium text-sm">{s.label}</span>
              </Link>
            );
          })}
        </div>
      </div>

      <ContentCard className="p-5! text-sm text-muted-foreground">
        <p>
          <strong className="text-foreground">{usuariosCount.count ?? 0}</strong> usuários ativos.{' '}
          <Link href="/admin/usuarios" className="text-franzoni-orange hover:underline">
            Gerenciar →
          </Link>
        </p>
      </ContentCard>
    </>
  );
}
