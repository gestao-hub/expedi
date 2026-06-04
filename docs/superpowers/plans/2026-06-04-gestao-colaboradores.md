# Gestão de Colaboradores — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir que o admin de uma empresa adicione, desative/reative e mude o cargo de colaboradores que usam o Exped — operando na nuvem (fonte da verdade), com o hub read-only.

**Architecture:** Lógica core em funções puras com injeção de dependência do client Supabase (padrão `atualizarNfPedido`), testadas com mock. Server actions finas em `app/(app)/admin/usuarios/actions.ts` fazem auth + escopo de empresa + gate nuvem/hub e chamam a lógica core com `createAdminClient()` (service_role). Identidade nasce na nuvem e desce pro hub pelo sync existente (sem mudança no sync). "Desativar" = ban no GoTrue (`banned_until`, já sincronizado) + `profiles.ativo=false`.

**Tech Stack:** Next.js 16 (App Router, server actions), Supabase (PostgREST + GoTrue), TypeScript, Zod, vitest, shadcn UI (Dialog/Select/Badge), sonner (toast).

**Spec:** `docs/superpowers/specs/2026-06-04-gestao-colaboradores-design.md`

---

## File Structure

- `supabase/migrations/20260604120000_profiles_ativo.sql` — **Create.** Coluna `profiles.ativo`.
- `lib/types/database.ts` — **Modify.** Adicionar `ativo` ao tipo `profiles` (Row/Insert/Update).
- `lib/runtime.ts` — **Create.** Helper `isHub()`.
- `lib/__tests__/runtime.test.ts` — **Create.** Testa `isHub()`.
- `hub/maestro.mjs` — **Modify.** `EXPED_HUB: '1'` no env do app (robustez; a detecção por URL já cobre).
- `lib/validators/colaborador.ts` — **Create.** Schemas zod.
- `lib/validators/__tests__/colaborador.test.ts` — **Create.**
- `lib/colaboradores/criar.ts` — **Create.** `criarColaborador(admin, empresaId, input)`.
- `lib/colaboradores/desativar.ts` — **Create.** `desativarColaborador` / `reativarColaborador`.
- `lib/colaboradores/__tests__/criar.test.ts` — **Create.**
- `lib/colaboradores/__tests__/desativar.test.ts` — **Create.**
- `app/(app)/admin/usuarios/actions.ts` — **Modify.** 3 actions novas + gate `isHub()` na de cargo.
- `app/(app)/admin/usuarios/colaborador-actions.tsx` — **Create.** Botão Desativar/Reativar (client).
- `app/(app)/admin/usuarios/colaborador-form.tsx` — **Create.** Dialog "Adicionar colaborador" (client).
- `components/usuarios-table.tsx` — **Modify.** Badge Ativo/Inativo + ações + prop `canManage`.
- `app/(app)/admin/usuarios/page.tsx` — **Modify.** Query `ativo`, gate nuvem/hub, botão/aviso, texto.

---

## Task 1: Migration `profiles.ativo` + tipo

**Files:**
- Create: `supabase/migrations/20260604120000_profiles_ativo.sql`
- Modify: `lib/types/database.ts` (bloco `profiles`)

- [ ] **Step 1: Criar a migration (aditiva, idempotente)**

```sql
-- 20260604120000_profiles_ativo.sql — soft-deactivate de colaborador
-- Colaborador "desativado" tem ativo=false (UI mostra Inativo) + ban no GoTrue
-- (banned_until, que já desce no sync via sync_auth_users). Nunca apagamos o profile
-- (hiper_vendedor_map.vendedor_id é on delete restrict + preserva histórico de pedidos).
alter table public.profiles
  add column if not exists ativo boolean not null default true;
```

- [ ] **Step 2: Adicionar `ativo` ao tipo gerado**

Em `lib/types/database.ts`, no objeto `profiles` (procure `Row: {` dentro de `profiles:`),
adicionar a propriedade `ativo` nos três blocos. NÃO há geração automática neste projeto
(sem MCP do Supabase pra este projeto), então é manual:

- Em `Row:` adicionar `ativo: boolean`
- Em `Insert:` adicionar `ativo?: boolean`
- Em `Update:` adicionar `ativo?: boolean`

(coloque junto das outras colunas do profiles, ex.: logo após `role`.)

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260604120000_profiles_ativo.sql lib/types/database.ts
git commit -m "feat(colaboradores): coluna profiles.ativo (soft-deactivate)"
```

---

## Task 2: Helper `isHub()`

**Files:**
- Create: `lib/runtime.ts`
- Test: `lib/__tests__/runtime.test.ts`
- Modify: `hub/maestro.mjs:206-232` (appSupervisor env)

- [ ] **Step 1: Escrever o teste que falha**

`lib/__tests__/runtime.test.ts`:
```ts
import { describe, it, expect, afterEach, vi } from 'vitest';
import { isHub } from '../runtime';

afterEach(() => vi.unstubAllEnvs());

describe('isHub', () => {
  it('true quando SUPABASE_URL é localhost (hub)', () => {
    vi.stubEnv('EXPED_HUB', '');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
    vi.stubEnv('SUPABASE_URL', 'http://127.0.0.1:54340');
    expect(isHub()).toBe(true);
  });
  it('false quando SUPABASE_URL é a nuvem', () => {
    vi.stubEnv('EXPED_HUB', '');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
    vi.stubEnv('SUPABASE_URL', 'https://louaguxcohfeicxxqggw.supabase.co');
    expect(isHub()).toBe(false);
  });
  it('true quando EXPED_HUB=1 mesmo com URL da nuvem (override explícito)', () => {
    vi.stubEnv('EXPED_HUB', '1');
    vi.stubEnv('SUPABASE_URL', 'https://louaguxcohfeicxxqggw.supabase.co');
    expect(isHub()).toBe(true);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run lib/__tests__/runtime.test.ts`
Expected: FAIL ("Cannot find module '../runtime'").

- [ ] **Step 3: Implementar `lib/runtime.ts`**

```ts
import { supabaseUrl } from '@/lib/supabase/env';

/**
 * true se o app está rodando no HUB local (offline-first), false na nuvem.
 * O hub aponta o Supabase pro gateway local (127.0.0.1); a nuvem usa a URL real.
 * `EXPED_HUB=1` (setado pelo maestro do hub) é um override explícito de robustez.
 *
 * Uso: gestão de identidade (colaboradores) só pode escrever na NUVEM (fonte da
 * verdade); no hub a tela fica read-only — identidade só desce pelo sync.
 */
export function isHub(): boolean {
  if (process.env.EXPED_HUB === '1') return true;
  const url = supabaseUrl();
  return url.includes('127.0.0.1') || url.includes('localhost');
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run lib/__tests__/runtime.test.ts`
Expected: PASS (3 testes).

- [ ] **Step 5: Adicionar `EXPED_HUB` no env do app do hub**

Em `hub/maestro.mjs`, dentro de `appSupervisor`, no objeto `env:` (após `NODE_ENV: 'production',`),
adicionar a linha:
```js
      EXPED_HUB: '1',
```

- [ ] **Step 6: Commit**

```bash
git add lib/runtime.ts lib/__tests__/runtime.test.ts hub/maestro.mjs
git commit -m "feat(colaboradores): helper isHub() + EXPED_HUB no app do hub"
```

---

## Task 3: Validators (zod)

**Files:**
- Create: `lib/validators/colaborador.ts`
- Test: `lib/validators/__tests__/colaborador.test.ts`

- [ ] **Step 1: Escrever o teste que falha**

`lib/validators/__tests__/colaborador.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { criarColaboradorSchema } from '../colaborador';

describe('criarColaboradorSchema', () => {
  it('aceita um colaborador válido', () => {
    const r = criarColaboradorSchema.safeParse({
      full_name: 'Gustavo', email: 'gustavo@franzoni.local', password: 'Franzoni@2026', role: 'vendedor',
    });
    expect(r.success).toBe(true);
  });
  it('rejeita senha curta', () => {
    const r = criarColaboradorSchema.safeParse({
      full_name: 'X', email: 'x@y.local', password: '123', role: 'admin',
    });
    expect(r.success).toBe(false);
  });
  it('rejeita role inválido', () => {
    const r = criarColaboradorSchema.safeParse({
      full_name: 'X', email: 'x@y.local', password: 'aaaaaaaa', role: 'financeiro',
    });
    expect(r.success).toBe(false);
  });
  it('coage hiper_usuario_id string→int', () => {
    const r = criarColaboradorSchema.safeParse({
      full_name: 'X', email: 'x@y.local', password: 'aaaaaaaa', role: 'vendedor', hiper_usuario_id: '12',
    });
    expect(r.success && r.data.hiper_usuario_id).toBe(12);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run lib/validators/__tests__/colaborador.test.ts`
Expected: FAIL (módulo inexistente).

- [ ] **Step 3: Implementar `lib/validators/colaborador.ts`**

```ts
import { z } from 'zod';

export const criarColaboradorSchema = z.object({
  full_name: z.string().min(1, 'Nome obrigatório').max(200),
  email: z.string().email('E-mail inválido'),
  // bcrypt trunca em 72 bytes; min 8 por segurança básica.
  password: z.string().min(8, 'Senha precisa de ao menos 8 caracteres').max(72),
  role: z.enum(['admin', 'vendedor', 'logistica']),
  hiper_usuario_id: z.coerce.number().int().positive().optional(),
  hiper_usuario_nome: z.string().max(200).optional(),
});
export type CriarColaboradorInput = z.infer<typeof criarColaboradorSchema>;

export const idColaboradorSchema = z.object({ id: z.uuid() });
export type IdColaboradorInput = z.infer<typeof idColaboradorSchema>;
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run lib/validators/__tests__/colaborador.test.ts`
Expected: PASS (4 testes).

- [ ] **Step 5: Commit**

```bash
git add lib/validators/colaborador.ts lib/validators/__tests__/colaborador.test.ts
git commit -m "feat(colaboradores): validators zod (criar + id)"
```

---

## Task 4: Core `criarColaborador` (DI)

**Files:**
- Create: `lib/colaboradores/criar.ts`
- Test: `lib/colaboradores/__tests__/criar.test.ts`

- [ ] **Step 1: Escrever o teste que falha**

`lib/colaboradores/__tests__/criar.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { criarColaborador } from '../criar';
import type { CriarColaboradorInput } from '@/lib/validators/colaborador';

// Mock do admin client: createUser + from(...).update().eq() + from(...).upsert()
function mockAdmin(opts: { createError?: string; newId?: string } = {}) {
  const calls: { updates: Record<string, unknown>[]; upserts: { table: string; row: Record<string, unknown> }[]; createdWith?: unknown } = {
    updates: [], upserts: [],
  };
  const admin = {
    auth: {
      admin: {
        async createUser(payload: unknown) {
          calls.createdWith = payload;
          if (opts.createError) return { data: { user: null }, error: { message: opts.createError } };
          return { data: { user: { id: opts.newId ?? 'NEW1' } }, error: null };
        },
      },
    },
    from(table: string) {
      return {
        update(patch: Record<string, unknown>) {
          calls.updates.push(patch);
          return { eq: async () => ({ error: null }) };
        },
        async upsert(row: Record<string, unknown>) {
          calls.upserts.push({ table, row });
          return { error: null };
        },
      };
    },
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { admin: admin as any, calls };
}

const base: CriarColaboradorInput = {
  full_name: 'Gustavo', email: 'gustavo@franzoni.local', password: 'Franzoni@2026', role: 'vendedor',
};

describe('criarColaborador', () => {
  it('cria usuário + atribui empresa/role/ativo', async () => {
    const { admin, calls } = mockAdmin({ newId: 'U7' });
    const r = await criarColaborador(admin, 'E1', { ...base, role: 'logistica' });
    expect(r).toEqual({ ok: true, id: 'U7' });
    expect(calls.updates[0]).toEqual({ empresa_id: 'E1', role: 'logistica', full_name: 'Gustavo', ativo: true });
  });
  it('vendedor com hiper_usuario_id → upsert no mapa', async () => {
    const { admin, calls } = mockAdmin({ newId: 'U8' });
    await criarColaborador(admin, 'E1', { ...base, hiper_usuario_id: 12, hiper_usuario_nome: 'GUSTAVO' });
    expect(calls.upserts[0]).toEqual({
      table: 'hiper_vendedor_map',
      row: { empresa_id: 'E1', hiper_usuario_id: 12, vendedor_id: 'U8', hiper_usuario_nome: 'GUSTAVO' },
    });
  });
  it('sem hiper_usuario_id → NÃO faz upsert no mapa', async () => {
    const { admin, calls } = mockAdmin();
    await criarColaborador(admin, 'E1', base);
    expect(calls.upserts).toHaveLength(0);
  });
  it('email duplicado → mensagem amigável', async () => {
    const { admin } = mockAdmin({ createError: 'A user with this email address has already been registered' });
    const r = await criarColaborador(admin, 'E1', base);
    expect(r).toEqual({ error: 'Já existe um colaborador com esse email' });
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run lib/colaboradores/__tests__/criar.test.ts`
Expected: FAIL (módulo inexistente).

- [ ] **Step 3: Implementar `lib/colaboradores/criar.ts`**

```ts
import type { SupabaseClient } from '@supabase/supabase-js';
import type { CriarColaboradorInput } from '@/lib/validators/colaborador';

export type CriarColaboradorResult = { ok: true; id: string } | { error: string };

/**
 * Cria um colaborador NA NUVEM (fonte da verdade) e o desce pro hub pelo sync.
 * `admin` é um client service_role (ignora RLS). `empresaId` vem SEMPRE do servidor
 * (empresa do chamador) — nunca do input, pra um admin não criar em outra empresa.
 */
export async function criarColaborador(
  admin: SupabaseClient,
  empresaId: string,
  input: CriarColaboradorInput,
): Promise<CriarColaboradorResult> {
  const { data: created, error: e1 } = await admin.auth.admin.createUser({
    email: input.email,
    password: input.password,
    email_confirm: true,
    user_metadata: { full_name: input.full_name },
  });
  if (e1 || !created?.user) {
    const msg = e1?.message || 'Falha ao criar usuário';
    return { error: /already.*registered|already exists/i.test(msg) ? 'Já existe um colaborador com esse email' : msg };
  }
  const id = created.user.id;

  // Trigger handle_new_user já criou o profile (role=vendedor, empresa=null, ativo=true).
  // Atribuímos empresa/role/nome via service_role (prevent_self_role_change libera com auth.uid() null).
  const { error: e2 } = await admin
    .from('profiles')
    .update({ empresa_id: empresaId, role: input.role, full_name: input.full_name, ativo: true })
    .eq('id', id);
  if (e2) return { error: `Usuário criado, mas atribuição falhou: ${e2.message}` };

  if (input.role === 'vendedor' && input.hiper_usuario_id != null) {
    const { error: e3 } = await admin.from('hiper_vendedor_map').upsert({
      empresa_id: empresaId,
      hiper_usuario_id: input.hiper_usuario_id,
      vendedor_id: id,
      hiper_usuario_nome: input.hiper_usuario_nome ?? input.full_name,
    });
    if (e3) return { error: `Colaborador criado, mas o mapa do Hiper falhou: ${e3.message}` };
  }
  return { ok: true, id };
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run lib/colaboradores/__tests__/criar.test.ts`
Expected: PASS (4 testes).

- [ ] **Step 5: Commit**

```bash
git add lib/colaboradores/criar.ts lib/colaboradores/__tests__/criar.test.ts
git commit -m "feat(colaboradores): core criarColaborador (DI, testado)"
```

---

## Task 5: Core `desativarColaborador` / `reativarColaborador` (DI)

**Files:**
- Create: `lib/colaboradores/desativar.ts`
- Test: `lib/colaboradores/__tests__/desativar.test.ts`

- [ ] **Step 1: Escrever o teste que falha**

`lib/colaboradores/__tests__/desativar.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { desativarColaborador, reativarColaborador } from '../desativar';

// Mock admin: select().eq().eq().maybeSingle() (checagem de empresa) + updateUserById + update().eq()
function mockAdmin(alvo: { id: string } | null) {
  const calls: { bans: { id: string; ban?: string }[]; updates: Record<string, unknown>[] } = { bans: [], updates: [] };
  const admin = {
    auth: { admin: { async updateUserById(id: string, attrs: { ban_duration?: string }) { calls.bans.push({ id, ban: attrs.ban_duration }); return { error: null }; } } },
    from() {
      return {
        select() { return this; },
        eq() { return this; },
        async maybeSingle() { return { data: alvo }; },
        update(patch: Record<string, unknown>) { calls.updates.push(patch); return { eq() { return { eq: async () => ({ error: null }) }; } }; },
      };
    },
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { admin: admin as any, calls };
}

describe('desativarColaborador', () => {
  it('alvo da empresa → ban perpétuo + ativo=false', async () => {
    const { admin, calls } = mockAdmin({ id: 'U1' });
    const r = await desativarColaborador(admin, { id: 'U1', empresaId: 'E1' });
    expect(r).toEqual({ ok: true });
    expect(calls.bans[0].id).toBe('U1');
    expect(calls.bans[0].ban).toBe('876000h');
    expect(calls.updates[0]).toEqual({ ativo: false });
  });
  it('alvo NÃO é da empresa → erro, sem ban', async () => {
    const { admin, calls } = mockAdmin(null);
    const r = await desativarColaborador(admin, { id: 'U1', empresaId: 'E1' });
    expect(r).toEqual({ error: 'Colaborador não encontrado nesta empresa' });
    expect(calls.bans).toHaveLength(0);
  });
});

describe('reativarColaborador', () => {
  it('alvo da empresa → remove ban + ativo=true', async () => {
    const { admin, calls } = mockAdmin({ id: 'U1' });
    const r = await reativarColaborador(admin, { id: 'U1', empresaId: 'E1' });
    expect(r).toEqual({ ok: true });
    expect(calls.bans[0].ban).toBe('none');
    expect(calls.updates[0]).toEqual({ ativo: true });
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run lib/colaboradores/__tests__/desativar.test.ts`
Expected: FAIL (módulo inexistente).

- [ ] **Step 3: Implementar `lib/colaboradores/desativar.ts`**

```ts
import type { SupabaseClient } from '@supabase/supabase-js';

export type ToggleResult = { ok: true } | { error: string };

const BAN_FOREVER = '876000h'; // ~100 anos — bloqueia login até reativar.

/** Confirma que o alvo pertence à empresa do chamador antes de mutar (service_role ignora RLS). */
async function alvoDaEmpresa(admin: SupabaseClient, id: string, empresaId: string): Promise<boolean> {
  const { data } = await admin.from('profiles').select('id').eq('id', id).eq('empresa_id', empresaId).maybeSingle();
  return !!data;
}

export async function desativarColaborador(
  admin: SupabaseClient,
  { id, empresaId }: { id: string; empresaId: string },
): Promise<ToggleResult> {
  if (!(await alvoDaEmpresa(admin, id, empresaId))) return { error: 'Colaborador não encontrado nesta empresa' };
  const { error: e1 } = await admin.auth.admin.updateUserById(id, { ban_duration: BAN_FOREVER });
  if (e1) return { error: e1.message };
  const { error: e2 } = await admin.from('profiles').update({ ativo: false }).eq('id', id).eq('empresa_id', empresaId);
  if (e2) return { error: e2.message };
  return { ok: true };
}

export async function reativarColaborador(
  admin: SupabaseClient,
  { id, empresaId }: { id: string; empresaId: string },
): Promise<ToggleResult> {
  if (!(await alvoDaEmpresa(admin, id, empresaId))) return { error: 'Colaborador não encontrado nesta empresa' };
  const { error: e1 } = await admin.auth.admin.updateUserById(id, { ban_duration: 'none' });
  if (e1) return { error: e1.message };
  const { error: e2 } = await admin.from('profiles').update({ ativo: true }).eq('id', id).eq('empresa_id', empresaId);
  if (e2) return { error: e2.message };
  return { ok: true };
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run lib/colaboradores/__tests__/desativar.test.ts`
Expected: PASS (3 testes).

- [ ] **Step 5: Commit**

```bash
git add lib/colaboradores/desativar.ts lib/colaboradores/__tests__/desativar.test.ts
git commit -m "feat(colaboradores): core desativar/reativar (DI, ban+ativo, escopo empresa)"
```

---

## Task 6: Server actions (wiring auth + gate + escopo)

**Files:**
- Modify: `app/(app)/admin/usuarios/actions.ts`

- [ ] **Step 1: Substituir o conteúdo de `actions.ts`**

Mantém `updateUserRoleAction` (com gate `isHub()` novo) e adiciona as 3 actions. Conteúdo completo:

```ts
'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isHub } from '@/lib/runtime';
import { criarColaboradorSchema, idColaboradorSchema } from '@/lib/validators/colaborador';
import { criarColaborador } from '@/lib/colaboradores/criar';
import { desativarColaborador, reativarColaborador } from '@/lib/colaboradores/desativar';

const SO_NUVEM = 'A gestão de equipe é feita no Exped na nuvem.';

/** Resolve o chamador: precisa ser admin com empresa. Retorna a empresa dele. */
async function exigirAdminComEmpresa():
  Promise<{ userId: string; empresaId: string } | { error: string }> {
  const supa = await createClient();
  const { data: { user } } = await supa.auth.getUser();
  if (!user) return { error: 'Não autenticado' };
  const { data: me } = await supa.from('profiles').select('role, empresa_id').eq('id', user.id).single();
  if (me?.role !== 'admin') return { error: 'Apenas admin pode gerenciar a equipe' };
  if (!me?.empresa_id) return { error: 'Seu perfil não tem empresa' };
  return { userId: user.id, empresaId: me.empresa_id as string };
}

const updateRoleSchema = z.object({ id: z.uuid(), role: z.enum(['admin', 'vendedor', 'logistica']) });

export async function updateUserRoleAction(input: { id: string; role: string }) {
  if (isHub()) return { error: SO_NUVEM };
  const parsed = updateRoleSchema.safeParse(input);
  if (!parsed.success) return { error: 'Dados inválidos' };
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Não autenticado' };
  const { data: me } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (me?.role !== 'admin') return { error: 'Apenas admin pode alterar roles' };
  if (parsed.data.id === user.id && parsed.data.role !== 'admin') {
    return { error: 'Você não pode rebaixar seu próprio role' };
  }
  const { error } = await supabase.from('profiles').update({ role: parsed.data.role }).eq('id', parsed.data.id);
  if (error) return { error: error.message };
  revalidatePath('/admin/usuarios');
  return { ok: true as const };
}

export async function criarColaboradorAction(input: unknown) {
  if (isHub()) return { error: SO_NUVEM };
  const parsed = criarColaboradorSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Dados inválidos' };
  const who = await exigirAdminComEmpresa();
  if ('error' in who) return who;
  const r = await criarColaborador(createAdminClient(), who.empresaId, parsed.data);
  if ('error' in r) return r;
  revalidatePath('/admin/usuarios');
  return { ok: true as const };
}

export async function desativarColaboradorAction(input: unknown) {
  if (isHub()) return { error: SO_NUVEM };
  const parsed = idColaboradorSchema.safeParse(input);
  if (!parsed.success) return { error: 'Dados inválidos' };
  const who = await exigirAdminComEmpresa();
  if ('error' in who) return who;
  if (parsed.data.id === who.userId) return { error: 'Você não pode desativar a si mesmo' };
  const r = await desativarColaborador(createAdminClient(), { id: parsed.data.id, empresaId: who.empresaId });
  if ('error' in r) return r;
  revalidatePath('/admin/usuarios');
  return { ok: true as const };
}

export async function reativarColaboradorAction(input: unknown) {
  if (isHub()) return { error: SO_NUVEM };
  const parsed = idColaboradorSchema.safeParse(input);
  if (!parsed.success) return { error: 'Dados inválidos' };
  const who = await exigirAdminComEmpresa();
  if ('error' in who) return who;
  const r = await reativarColaborador(createAdminClient(), { id: parsed.data.id, empresaId: who.empresaId });
  if ('error' in r) return r;
  revalidatePath('/admin/usuarios');
  return { ok: true as const };
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 3: Rodar a suíte (nada quebrou)**

Run: `npx vitest run`
Expected: tudo verde (testes das Tasks 2-5 inclusos).

- [ ] **Step 4: Commit**

```bash
git add "app/(app)/admin/usuarios/actions.ts"
git commit -m "feat(colaboradores): server actions (criar/desativar/reativar) + gate nuvem/hub na de cargo"
```

---

## Task 7: UI — tabela com status + ações

**Files:**
- Create: `app/(app)/admin/usuarios/colaborador-actions.tsx`
- Modify: `components/usuarios-table.tsx`

- [ ] **Step 1: Criar o botão Desativar/Reativar (client)**

`app/(app)/admin/usuarios/colaborador-actions.tsx`:
```tsx
'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { desativarColaboradorAction, reativarColaboradorAction } from './actions';

export function ColaboradorActions({
  userId,
  ativo,
  disabled,
}: {
  userId: string;
  ativo: boolean;
  disabled?: boolean;
}) {
  const [pending, start] = useTransition();
  const router = useRouter();

  function run(action: typeof desativarColaboradorAction, okMsg: string, confirmMsg?: string) {
    if (confirmMsg && !window.confirm(confirmMsg)) return;
    start(async () => {
      const r = await action({ id: userId });
      if ('error' in r) toast.error(r.error);
      else {
        toast.success(okMsg);
        router.refresh();
      }
    });
  }

  return ativo ? (
    <Button
      variant="ghost"
      size="sm"
      className="h-8 text-destructive hover:text-destructive"
      disabled={disabled || pending}
      onClick={() => run(desativarColaboradorAction, 'Colaborador desativado', 'Desativar este colaborador? Ele não conseguirá mais entrar (reversível).')}
    >
      {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Desativar'}
    </Button>
  ) : (
    <Button
      variant="ghost"
      size="sm"
      className="h-8"
      disabled={disabled || pending}
      onClick={() => run(reativarColaboradorAction, 'Colaborador reativado')}
    >
      {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Reativar'}
    </Button>
  );
}
```

- [ ] **Step 2: Atualizar `components/usuarios-table.tsx`**

Mudanças:
1. Imports novos (após o import do `RoleSelect`):
```tsx
import { Badge } from '@/components/ui/badge';
import { ColaboradorActions } from '@/app/(app)/admin/usuarios/colaborador-actions';
```
2. Assinatura do componente — adicionar `canManage`:
```tsx
export function UsuariosTable({
  profiles,
  currentUserId,
  canManage,
}: {
  profiles: Profile[];
  currentUserId: string;
  canManage: boolean;
}) {
```
3. No card MOBILE, dentro do `<div className="shrink-0">` que tem o `RoleSelect`, trocar por uma coluna com status + (se canManage) o RoleSelect e as ações:
```tsx
            <div className="shrink-0 flex flex-col items-end gap-1">
              {!p.ativo && <Badge variant="secondary">Inativo</Badge>}
              {canManage && (
                <>
                  <RoleSelect userId={p.id} currentRole={p.role} disabled={p.id === currentUserId || !p.ativo} />
                  <ColaboradorActions userId={p.id} ativo={p.ativo} disabled={p.id === currentUserId} />
                </>
              )}
            </div>
```
4. DESKTOP: adicionar uma coluna "Status/Ações" no header (após o `SortableHead` de "Criado em"), com `width="w-44 pr-5"` e label `Ações` (sem sort — use um `<th>` simples seguindo o estilo do `SortableHead`, ou um `SortableHead` desativado). Para simplicidade, troque o último `SortableHead` (Criado em) para `width="w-32"` e adicione, depois dele:
```tsx
          <th className="w-44 pr-5 text-right text-xs font-medium text-muted-foreground">Status</th>
```
5. DESKTOP: na linha, após a `<TableCell>` de "Criado em", adicionar:
```tsx
            <TableCell className="pr-5 text-right">
              <div className="flex items-center justify-end gap-2">
                {!p.ativo && <Badge variant="secondary">Inativo</Badge>}
                {canManage && <ColaboradorActions userId={p.id} ativo={p.ativo} disabled={p.id === currentUserId} />}
              </div>
            </TableCell>
```
6. Ajustar o `colSpan` do "Nenhum usuário." de `4` para `5`.
7. O `RoleSelect` no desktop: envolver com `{canManage ? <RoleSelect .../> : <span className="text-sm">{p.role}</span>}` pra ficar read-only no hub.

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: sem erros (note: `p.ativo` existe após Task 1).

- [ ] **Step 4: Commit**

```bash
git add components/usuarios-table.tsx "app/(app)/admin/usuarios/colaborador-actions.tsx"
git commit -m "feat(colaboradores): tabela com status Ativo/Inativo + acoes (read-only no hub)"
```

---

## Task 8: UI — Dialog "Adicionar colaborador"

**Files:**
- Create: `app/(app)/admin/usuarios/colaborador-form.tsx`

- [ ] **Step 1: Criar o formulário em Dialog (client)**

`app/(app)/admin/usuarios/colaborador-form.tsx`:
```tsx
'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, UserPlus } from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog, DialogContent, Dialogheader, DialogTitle, DialogTrigger, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { criarColaboradorAction } from './actions';

export function ColaboradorForm() {
  const [open, setOpen] = useState(false);
  const [role, setRole] = useState('vendedor');
  const [pending, start] = useTransition();
  const router = useRouter();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const input = {
      full_name: String(fd.get('full_name') || '').trim(),
      email: String(fd.get('email') || '').trim(),
      password: String(fd.get('password') || ''),
      role,
      hiper_usuario_id: fd.get('hiper_usuario_id') ? String(fd.get('hiper_usuario_id')) : undefined,
      hiper_usuario_nome: fd.get('full_name') ? String(fd.get('full_name')) : undefined,
    };
    start(async () => {
      const r = await criarColaboradorAction(input);
      if ('error' in r) toast.error(r.error);
      else {
        toast.success('Colaborador adicionado');
        setOpen(false);
        router.refresh();
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm"><UserPlus className="h-4 w-4 mr-1.5" />Adicionar colaborador</Button>
      </DialogTrigger>
      <DialogContent>
        <Dialogheader><DialogTitle>Adicionar colaborador</DialogTitle></DialogheADER>
        <form onSubmit={onSubmit} className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="full_name">Nome</Label>
            <Input id="full_name" name="full_name" required maxLength={200} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="email">E-mail (login)</Label>
            <Input id="email" name="email" type="email" required placeholder="nome@franzoni.local" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="password">Senha inicial</Label>
            <Input id="password" name="password" required minLength={8} />
          </div>
          <div className="space-y-1">
            <Label>Cargo</Label>
            <Select value={role} onValueChange={setRole}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="admin">admin</SelectItem>
                <SelectItem value="vendedor">vendedor</SelectItem>
                <SelectItem value="logistica">logistica</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {role === 'vendedor' && (
            <div className="space-y-1">
              <Label htmlFor="hiper_usuario_id">ID do vendedor no Hiper (opcional)</Label>
              <Input id="hiper_usuario_id" name="hiper_usuario_id" type="number" min={1} placeholder="ex: 12" />
            </div>
          )}
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Adicionar'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
```

> NOTA pro implementador: confira os nomes EXATOS dos exports de `components/ui/dialog.tsx`
> (`DialogHeader`, `DialogFooter`, `DialogTitle`, `DialogContent`, `DialogTrigger`) e
> corrija o casing no código acima (o trecho `DialogheADER`/`DialogHeader` é proposital
> pra você validar). Veja um uso real em `components/registrar-entrega-dialog.tsx`.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: sem erros (após corrigir o casing dos componentes de Dialog).

- [ ] **Step 3: Commit**

```bash
git add "app/(app)/admin/usuarios/colaborador-form.tsx"
git commit -m "feat(colaboradores): dialog Adicionar colaborador (campo Hiper opcional p/ vendedor)"
```

---

## Task 9: UI — página (gate nuvem/hub + wiring)

**Files:**
- Modify: `app/(app)/admin/usuarios/page.tsx`

- [ ] **Step 1: Reescrever `page.tsx`**

```tsx
import { redirect } from 'next/navigation';
import { PageHeader } from '@/components/layout/page-header';
import { ContentCard } from '@/components/layout/content-card';
import { UsuariosTable } from '@/components/usuarios-table';
import { ColaboradorForm } from './colaborador-form';
import { createClient } from '@/lib/supabase/server';
import { isHub } from '@/lib/runtime';
import type { Profile } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default async function UsuariosPage() {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: me } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (me?.role !== 'admin') redirect('/vendas');

  const { data: profiles, error } = await supabase
    .from('profiles')
    .select('*')
    .order('ativo', { ascending: false })
    .order('role')
    .order('email');

  const list = (profiles ?? []) as Profile[];
  const hub = isHub();
  const ativos = list.filter((p) => p.ativo).length;

  return (
    <div className="flex flex-col flex-1 min-h-0 gap-4">
      <PageHeader
        title="Equipe"
        description={
          hub
            ? 'Visualização. A gestão da equipe (adicionar/desativar) é feita no Exped na nuvem.'
            : `${ativos} colaborador${ativos === 1 ? '' : 'es'} ativo${ativos === 1 ? '' : 's'}.`
        }
        actions={hub ? undefined : <ColaboradorForm />}
      />

      <ContentCard variant="flush" className="flex flex-col flex-1 min-h-0">
        {error ? (
          <p className="p-6 text-sm text-destructive">{error.message}</p>
        ) : (
          <div className="flex-1 overflow-y-auto min-h-0">
            <UsuariosTable profiles={list} currentUserId={user.id} canManage={!hub} />
          </div>
        )}
      </ContentCard>
    </div>
  );
}
```

> NOTA pro implementador: confira se `PageHeader` aceita a prop `actions` (veja
> `components/layout/page-header.tsx`). Se NÃO aceitar, renderize `<ColaboradorForm />`
> fora do `PageHeader` (ex.: numa `div` com `justify-end` acima do `ContentCard`),
> mantendo o mesmo gate `!hub`.

- [ ] **Step 2: Typecheck + suíte completa**

Run: `npx tsc --noEmit && npx vitest run`
Expected: typecheck limpo; todos os testes verdes.

- [ ] **Step 3: Build de produção (garante que o app compila)**

Run: `npx next build`
Expected: build conclui sem erro (pode haver warnings de lint pré-existentes — não-bloqueantes).

- [ ] **Step 4: Commit**

```bash
git add "app/(app)/admin/usuarios/page.tsx"
git commit -m "feat(colaboradores): pagina Equipe com gate nuvem/hub (add na nuvem, read-only no hub)"
```

---

## Task 10: Verificação final + migration na nuvem

**Files:** nenhum (verificação).

- [ ] **Step 1: Suíte completa + typecheck**

Run: `npx tsc --noEmit && npx vitest run`
Expected: tudo verde.

- [ ] **Step 2: Dry-run da migration (revisão manual)**

A migration `20260604120000_profiles_ativo.sql` é aditiva e idempotente (`add column if not exists`).
Aplicação na NUVEM é feita pelo usuário (sem MCP deste projeto): rodar no SQL Editor do Supabase:
```sql
alter table public.profiles add column if not exists ativo boolean not null default true;
```
O hub aplica sozinho via `_hub_migrations` no próximo reinstall/update.

- [ ] **Step 3: Checklist de spec coverage** (ver Self-Review abaixo) — confirmar tudo coberto.

---

## Self-Review (preenchido pelo autor do plano)

**1. Spec coverage:**
- Adicionar colaborador → Task 4 + 6 + 8. ✓
- Desativar/reativar (soft, ban+ativo) → Task 1 + 5 + 6 + 7. ✓
- Mudar cargo só-nuvem (fix do bug latente) → Task 6 (gate isHub na updateUserRoleAction). ✓
- Listar com Ativo/Inativo → Task 7 + 9. ✓
- Escopo por empresa → Task 4/5 (empresaId do servidor) + 6 (exigirAdminComEmpresa). ✓
- Gate nuvem/hub → Task 2 (isHub) + 6 (actions) + 7/9 (UI read-only). ✓
- Campo Hiper opcional no vendedor → Task 3 (schema) + 4 (upsert) + 8 (campo). ✓
- `profiles.ativo` migration → Task 1. ✓
- Sem mudança no sync (identidade já desce) → confirmado (selectChanges usa `select('*')`; sync_auth_users já envia banned_until). ✓
- Fora: financeiro, offline, convite por email → não há task (correto). ✓

**2. Placeholder scan:** Sem TBD/“implementar depois”. As duas NOTAs (Dialog casing, PageHeader.actions) são checagens explícitas de API local, com a fonte a conferir — não são placeholders de lógica.

**3. Type consistency:** `criarColaborador(admin, empresaId, input)`, `desativarColaborador(admin, {id, empresaId})`, `reativarColaborador(...)`, `isHub()`, `criarColaboradorSchema`/`idColaboradorSchema`, actions `criarColaboradorAction`/`desativarColaboradorAction`/`reativarColaboradorAction`, prop `canManage`, coluna `ativo` — nomes consistentes entre tasks.
