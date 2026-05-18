import { redirect } from 'next/navigation';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { createClient } from '@/lib/supabase/server';
import type { Profile } from '@/lib/types';
import { RoleSelect } from './role-select';

export const dynamic = 'force-dynamic';

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

export default async function UsuariosPage() {
  const supabase = await createClient();

  // gate por role (camada UX — RLS é a real)
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: me } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (me?.role !== 'admin') redirect('/vendas');

  const { data: profiles, error } = await supabase
    .from('profiles')
    .select('*')
    .order('role')
    .order('email');

  const list = (profiles ?? []) as Profile[];

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div>
        <h2 className="text-2xl font-semibold">Usuários</h2>
        <p className="text-sm text-muted-foreground">
          {list.length} usuário{list.length === 1 ? '' : 's'} ativos. Para criar novos,
          rode <code className="text-xs bg-muted px-1 py-0.5 rounded">scripts/seed-users.ts</code>
          {' '}ou crie via Supabase Dashboard → Authentication.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Cadastros</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {error ? (
            <p className="p-6 text-sm text-destructive">{error.message}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>E-mail</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Criado em</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Avatar className="h-8 w-8 bg-franzoni-orange/15 text-franzoni-orange-700">
                          <AvatarFallback className="bg-transparent text-xs font-medium">
                            {initials(p.full_name || p.email)}
                          </AvatarFallback>
                        </Avatar>
                        <span className="font-medium">{p.full_name || '—'}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground font-mono text-xs">
                      {p.email}
                    </TableCell>
                    <TableCell>
                      <RoleSelect
                        userId={p.id}
                        currentRole={p.role}
                        disabled={p.id === user.id /* não permite editar o próprio */}
                      />
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {p.created_at
                        ? format(new Date(p.created_at), "dd 'de' MMM yyyy", { locale: ptBR })
                        : '—'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
