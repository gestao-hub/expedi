// Teste ponta a ponta do gateway 1-URL usando o MESMO supabase-js do app.
//
// Prova: login (gateway -> GoTrue), leitura escopada por RLS (gateway -> PostgREST)
// e escrita persistente, tudo numa única URL base.
//
// Pré-requisitos (já devem estar rodando):
//   - gateway em 127.0.0.1:54320
//   - usuário teste@exped.local promovido a admin da Franzoni
//
// Rodar: node scripts/local-stack/e2e-test.mjs

import { createClient } from '@supabase/supabase-js';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://127.0.0.1:54320';

// Gera a anon key on-the-fly (mesma secret) pra não depender de .env carregado.
// execFileSync com array de args -> sem shell, sem injeção.
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  execFileSync(path.join(here, 'make-keys.sh'), ['anon']).toString().trim();

const FRANZONI = '00000000-0000-0000-0000-0000000f0001';
let failures = 0;
const ok = (m) => console.log(`  OK   ${m}`);
const bad = (m) => { console.log(`  FAIL ${m}`); failures++; };

// psql via execFileSync (args separados -> sem shell).
function psql(sql) {
  return execFileSync(
    'psql',
    ['-p', '54329', '-h', '/tmp/exped-pg', '-U', 'postgres', '-d', 'exped', '-t', '-A', '-c', sql],
  ).toString().trim();
}

const supabase = createClient(SUPA_URL, ANON, {
  auth: { persistSession: false, autoRefreshToken: false },
});

console.log(`\n== e2e via supabase-js -> ${SUPA_URL} ==\n`);

// (a) LOGIN
console.log('(a) signInWithPassword');
const { data: signIn, error: signInErr } = await supabase.auth.signInWithPassword({
  email: 'teste@exped.local',
  password: 'Teste123@',
});
if (signInErr) bad(`login: ${signInErr.message}`);
else if (signIn?.session?.access_token) ok(`login -> session (user ${signIn.user.id})`);
else bad('login: sem session');

// (b) LEITURA escopada por RLS
console.log('\n(b) select empresas (RLS: admin vê a própria empresa)');
const { data: rows, error: selErr } = await supabase
  .from('empresas')
  .select('id,nome');
if (selErr) bad(`select: ${selErr.message}`);
else {
  console.log('     retorno:', JSON.stringify(rows));
  if (rows.length === 1 && rows[0].id === FRANZONI) ok(`leu somente a Franzoni (${rows[0].nome})`);
  else bad(`esperava só a Franzoni, veio ${rows.length} linha(s)`);
}

// (c) ESCRITA persistente
//
// NOTA: a RLS de `empresas` só permite escrita a is_platform_admin (não a um
// admin de empresa). A escrita escopada legítima do admin é em tabelas como
// `clientes` (policy clientes_insert: with_check empresa_id = current_empresa_id()).
// empresa_id default = current_empresa_id() -> grava na Franzoni automaticamente.
console.log('\n(c) insert clientes (escopado por RLS) + confirmação no psql');
const marca = `e2e-${Date.now()}`;
const { data: ins, error: insErr } = await supabase
  .from('clientes')
  .insert({ nome: marca })
  .select('id,nome,empresa_id');
if (insErr) bad(`insert: ${insErr.message}`);
else {
  console.log('     retorno insert:', JSON.stringify(ins));
  const row = ins?.[0];
  const noBanco = row ? psql(`select empresa_id from public.clientes where id='${row.id}'`) : '';
  console.log('     no banco (psql) empresa_id:', noBanco);
  if (row && row.empresa_id === FRANZONI && noBanco === FRANZONI) {
    ok('escrita persistiu no Postgres, escopada à Franzoni');
  } else {
    bad(`escrita não persistiu como esperado (empresa_id no banco: '${noBanco}')`);
  }
  // Limpeza: remove a linha de teste (DELETE permitido ao admin da própria empresa).
  if (row) {
    const { error: delErr } = await supabase.from('clientes').delete().eq('id', row.id);
    if (delErr) console.log(`     (aviso: limpeza falhou: ${delErr.message})`);
    else console.log('     limpeza: cliente de teste removido');
  }
}

console.log(`\n== ${failures === 0 ? 'TODOS OS PASSOS OK' : failures + ' FALHA(S)'} ==\n`);
process.exit(failures === 0 ? 0 : 1);
