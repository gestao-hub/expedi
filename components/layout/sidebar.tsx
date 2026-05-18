'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Package,
  PackagePlus,
  TruckIcon,
  ScanLine,
  History,
  Users,
  LogOut,
  Moon,
  Sun,
} from 'lucide-react';
import { useTheme } from 'next-themes';
import { cn } from '@/lib/utils';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { FranzoniLogo } from '@/components/franzoni-logo';
import { useUser } from '@/components/providers/user-provider';
import type { UserRole } from '@/lib/types';
import type { LucideIcon } from 'lucide-react';

type NavItem = { label: string; href: string; icon: LucideIcon };
type NavSection = { title: string; items: NavItem[] };

const NAV: Record<UserRole, NavSection[]> = {
  vendedor: [
    {
      title: 'Operação',
      items: [
        { label: 'Meus Pedidos', href: '/vendas',      icon: Package },
        { label: 'Novo Pedido',  href: '/vendas/novo', icon: PackagePlus },
      ],
    },
    {
      title: 'Consulta',
      items: [{ label: 'Histórico', href: '/historico', icon: History }],
    },
  ],
  logistica: [
    {
      title: 'Operação',
      items: [
        { label: 'Fila',         href: '/logistica',                       icon: TruckIcon },
        { label: 'Em Separação', href: '/logistica?status=em_separacao',  icon: ScanLine },
      ],
    },
    {
      title: 'Consulta',
      items: [{ label: 'Histórico', href: '/historico', icon: History }],
    },
  ],
  admin: [
    {
      title: 'Principal',
      items: [{ label: 'Dashboard', href: '/admin', icon: LayoutDashboard }],
    },
    {
      title: 'Operação',
      items: [
        { label: 'Pedidos',     href: '/vendas',      icon: Package },
        { label: 'Novo Pedido', href: '/vendas/novo', icon: PackagePlus },
        { label: 'Logística',   href: '/logistica',   icon: TruckIcon },
      ],
    },
    {
      title: 'Consulta',
      items: [{ label: 'Histórico', href: '/historico', icon: History }],
    },
    {
      title: 'Admin',
      items: [{ label: 'Usuários', href: '/admin/usuarios', icon: Users }],
    },
  ],
};

function initials(name: string) {
  return (
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase() ?? '')
      .join('') || '?'
  );
}

export function Sidebar() {
  const { profile } = useUser();
  const pathname = usePathname();
  const { setTheme, resolvedTheme } = useTheme();
  const sections = NAV[profile.role] ?? NAV.vendedor;

  return (
    <aside className="hidden md:flex w-64 shrink-0 flex-col sidebar-surface text-white">
      {/* Logo */}
      <div className="px-4 pt-8 pb-6 flex items-center justify-center border-b border-white/8">
        <Link href="/" className="block transition-opacity hover:opacity-90">
          <FranzoniLogo size={112} variant="light" />
        </Link>
      </div>

      {/* Nav */}
      <nav className="flex-1 py-3 space-y-1 overflow-y-auto">
        {sections.map((section) => (
          <div key={section.title} className="pb-2">
            <p className="nav-section-label">{section.title}</p>
            {section.items.map((item) => {
              const targetPath = item.href.split('?')[0];
              const active =
                pathname === targetPath ||
                (targetPath !== '/' && pathname.startsWith(targetPath + '/'));
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className="nav-item"
                  data-active={active}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className="truncate">{item.label}</span>
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      {/* Footer: user + theme + logout */}
      <div className="border-t border-white/8 px-3 py-3 space-y-2">
        <div className="flex items-center gap-3 px-2 py-1.5">
          <Avatar className="h-9 w-9 bg-franzoni-orange/20 ring-1 ring-franzoni-orange/30">
            <AvatarFallback className="bg-transparent text-sm font-semibold text-franzoni-orange-100">
              {initials(profile.full_name || profile.email || '?')}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium truncate text-white/95">
              {profile.full_name || profile.email}
            </p>
            <p className="text-xs text-white/50 capitalize">{profile.role}</p>
          </div>
        </div>

        <div className="flex gap-1.5">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Alternar tema"
            className="h-8 w-8 text-white/70 hover:text-white hover:bg-white/8"
            onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
          >
            {resolvedTheme === 'dark' ? (
              <Sun className="h-4 w-4" />
            ) : (
              <Moon className="h-4 w-4" />
            )}
          </Button>
          <form action="/auth/signout" method="post" className="flex-1">
            <Button
              type="submit"
              variant="ghost"
              size="sm"
              className={cn(
                'w-full justify-start text-white/70 hover:text-white hover:bg-white/8',
              )}
            >
              <LogOut className="h-4 w-4 mr-2" /> Sair
            </Button>
          </form>
        </div>
      </div>
    </aside>
  );
}
