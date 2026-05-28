import { test, expect, type Page, type Browser } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';

/**
 * Admin gerencia endereços de um cliente:
 *  1. cria cliente de teste via service role (com CNPJ)
 *  2. admin abre /admin/clientes → edita cliente → adiciona endereço "Obra QA"
 *  3. confirma que aparece na lista
 *  4. marca como padrão e edita rótulo
 *  5. cleanup: deleta cliente (cascade nos endereços)
 */

const PASSWORD = process.env.SEED_PASSWORD ?? 'Franzoni@2026';
const ADMIN = process.env.ADMIN_EMAIL ?? 'admin@franzoni.local';

function svc() {
  const env = readFileSync('../.env.local', 'utf8');
  const get = (k: string) =>
    (env.match(new RegExp(`^${k}=(.*)$`, 'm'))?.[1] ?? '').trim().replace(/^["']|["']$/g, '');
  return createClient(get('NEXT_PUBLIC_SUPABASE_URL'), get('SUPABASE_SERVICE_ROLE_KEY'));
}

async function loginAdmin(browser: Browser): Promise<Page> {
  const ctx = await browser.newContext({
    baseURL: process.env.BASE_URL ?? 'http://localhost:3030',
  });
  const page = await ctx.newPage();
  await page.goto('/login');
  await page.getByLabel(/e-?mail/i).fill(ADMIN);
  await page.getByLabel(/senha/i).fill(PASSWORD);
  await page.getByRole('button', { name: /entrar/i }).click();
  await page.waitForURL(/\/(admin|vendas)/, { timeout: 20_000 });
  return page;
}

test.describe.configure({ mode: 'serial' });

test.describe('Endereços do cliente — admin', () => {
  const sb = svc();
  const cnpj = `99.${Date.now().toString().slice(-7, -3)}.${Date.now().toString().slice(-3)}/0001-00`.slice(0, 18);
  const nome = `QA ADMIN ENDER ${Date.now()}`;
  let clienteId = '';

  test.beforeAll(async () => {
    const { data, error } = await sb
      .from('clientes')
      .insert({ nome, cnpj_cpf: cnpj })
      .select('id')
      .single();
    if (error || !data) throw new Error(`setup: ${error?.message}`);
    clienteId = data.id as string;
  });

  test('admin adiciona endereço e marca como padrão', async ({ browser }) => {
    const page = await loginAdmin(browser);
    await page.goto('/admin/clientes');
    await page.waitForLoadState('networkidle');

    // Busca o cliente
    await page.getByPlaceholder(/buscar/i).fill(nome);
    await page.waitForTimeout(600);
    const row = page.locator('table tr').filter({ hasText: nome }).first();
    await expect(row).toBeVisible({ timeout: 10_000 });
    await row.getByRole('button', { name: /editar/i }).click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText(/endereços de entrega/i)).toBeVisible();

    // Adiciona endereço
    await dialog.getByRole('button', { name: /adicionar/i }).click();
    const enderecoForm = dialog.locator('div.bg-franzoni-orange\\/5');
    await enderecoForm.getByPlaceholder(/sede, obra/i).fill('Obra QA');
    await enderecoForm.locator('input').nth(1).fill('Rua das Obras, 100');
    await enderecoForm.getByRole('button', { name: /^salvar$/i }).click();

    // Aparece na lista
    await expect(dialog.getByText('Obra QA').first()).toBeVisible({ timeout: 10_000 });
    await expect(dialog.getByText(/rua das obras/i).first()).toBeVisible();

    // Marca como padrão (botão estrela)
    await dialog.getByRole('button', { name: /marcar como padrão/i }).click();
    await expect(dialog.getByText('Padrão').first()).toBeVisible({ timeout: 10_000 });

    await page.context().close();
  });

  test.afterAll(async () => {
    if (clienteId) await sb.from('clientes').delete().eq('id', clienteId);
  });
});
