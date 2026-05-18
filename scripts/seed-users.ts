/**
 * Cria os usuários iniciais do Franzoni via service_role.
 *
 * Uso:
 *   npm install -D tsx dotenv
 *   npx tsx scripts/seed-users.ts
 *
 * Lê NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY de .env.local.
 *
 * Senha temporária padrão: "Franzoni@2026" (sobrescreve com SEED_PASSWORD).
 * Atenção: o trigger handle_new_user cria o profile com role default 'vendedor';
 * o script faz UPDATE no profile depois para alinhar o role correto.
 */
import { createClient } from '@supabase/supabase-js';
import { config as loadEnv } from 'dotenv';
import path from 'node:path';

loadEnv({ path: path.resolve(process.cwd(), '.env.local') });

type Role = 'admin' | 'vendedor' | 'logistica';

const USERS: Array<{ email: string; full_name: string; role: Role }> = [
  { email: 'admin@franzoni.local',     full_name: 'Admin Franzoni',          role: 'admin' },
  { email: 'vendas1@franzoni.local',   full_name: 'Vendedor 1',              role: 'vendedor' },
  { email: 'vendas2@franzoni.local',   full_name: 'Vendedor 2',              role: 'vendedor' },
  { email: 'vendas3@franzoni.local',   full_name: 'Vendedor 3',              role: 'vendedor' },
  { email: 'vendas4@franzoni.local',   full_name: 'Vendedor 4',              role: 'vendedor' },
  { email: 'logistica@franzoni.local', full_name: 'Logística Franzoni',      role: 'logistica' },
];

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('Faltando NEXT_PUBLIC_SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY em .env.local');
  }

  const password = process.env.SEED_PASSWORD ?? 'Franzoni@2026';
  const admin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

  for (const u of USERS) {
    process.stdout.write(`→ ${u.email.padEnd(28)} (${u.role})  `);

    // Cria ou ignora se já existir
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email: u.email,
      password,
      email_confirm: true,
      user_metadata: { full_name: u.full_name, role: u.role },
    });

    let userId = created?.user?.id;

    if (createErr) {
      if (/already (been )?registered|exists/i.test(createErr.message)) {
        // Acha o user existente
        const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
        userId = list?.users.find((x) => x.email?.toLowerCase() === u.email.toLowerCase())?.id;
        process.stdout.write('(já existe) ');
      } else {
        process.stdout.write(`✗ ${createErr.message}\n`);
        continue;
      }
    }

    if (!userId) {
      process.stdout.write('✗ sem userId\n');
      continue;
    }

    // Garante profile correto (trigger pode ter criado com role default)
    const { error: upErr } = await admin
      .from('profiles')
      .upsert({
        id: userId,
        email: u.email,
        full_name: u.full_name,
        role: u.role,
      });

    if (upErr) {
      process.stdout.write(`✗ profile: ${upErr.message}\n`);
      continue;
    }
    process.stdout.write('✓\n');
  }

  console.log(`\nSenha de todos: ${password}`);
  console.log('Mude as senhas no primeiro login em produção.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
