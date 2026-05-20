import { test, expect, type Page, type Browser } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdirSync, existsSync, unlinkSync } from 'node:fs';

/**
 * Verifica que os confirms agora usam modal da plataforma (não window.confirm
 * nativo do Chrome). Usa o fluxo de cancelar pedido:
 *  1. vendas1 cria pedido rascunho
 *  2. clica "Cancelar Pedido" → modal da plataforma aparece (role=dialog)
 *  3. clica "Voltar" → modal fecha, pedido continua
 *  4. clica "Cancelar Pedido" de novo → confirma → pedido vira cancelado
 *
 * Importante: NÃO registramos page.on('dialog') — se fosse window.confirm
 * nativo, o clique travaria (sem handler) e o teste falharia no timeout.
 */

const SAMPLES_DIR = './.samples';
const PASSWORD = process.env.SEED_PASSWORD ?? 'Franzoni@2026';
const VENDAS1 = process.env.VENDAS1_EMAIL ?? 'vendas1@franzoni.local';

async function loginVendas1(browser: Browser): Promise<Page> {
  const ctx = await browser.newContext({
    baseURL: process.env.BASE_URL ?? 'http://localhost:3030',
  });
  const page = await ctx.newPage();
  await page.goto('/login');
  await page.getByLabel(/e-?mail/i).fill(VENDAS1);
  await page.getByLabel(/senha/i).fill(PASSWORD);
  await page.getByRole('button', { name: /entrar/i }).click();
  await page.waitForURL(/\/vendas/, { timeout: 20_000 });
  return page;
}

test.describe.configure({ mode: 'serial' });

test.describe('Modais da plataforma (não-nativos)', () => {
  test.beforeAll(() => mkdirSync(SAMPLES_DIR, { recursive: true }));

  const docId = `QA-MODAL-${Date.now()}`;
  const pdfPath = `${SAMPLES_DIR}/${docId}.pdf`;

  test('cancelar pedido usa modal da plataforma com "Voltar" e "Cancelar pedido"', async ({ browser }) => {
    execFileSync('python3', ['scripts/make-sample-pdf.py', pdfPath, docId], { stdio: 'inherit' });

    const page = await loginVendas1(browser);
    // cria rascunho
    await page.goto('/vendas/novo');
    await page.locator('input[type="file"]').setInputFiles(pdfPath);
    await page.getByRole('button', { name: /processar pdf/i }).click();
    await expect(page.getByText(/revisar pedido/i)).toBeVisible({ timeout: 30_000 });
    await page.getByRole('button', { name: /salvar rascunho/i }).click();
    await page.waitForURL(/\/vendas\/[0-9a-f-]{36}/, { timeout: 15_000 });

    // Clica "Cancelar Pedido" → modal da plataforma (role=dialog), NÃO nativo
    await page.getByRole('button', { name: /cancelar pedido/i }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 5_000 });
    await expect(dialog.getByText(/cancelar este pedido\?/i)).toBeVisible();

    // "Voltar" fecha sem cancelar
    await dialog.getByRole('button', { name: /voltar/i }).click();
    await expect(dialog).toBeHidden({ timeout: 5_000 });

    // Confirma de fato
    await page.getByRole('button', { name: /cancelar pedido/i }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.getByRole('dialog').getByRole('button', { name: /cancelar pedido/i }).click();

    // Toast de sucesso + status cancelado
    await expect(page.getByText(/pedido cancelado/i).first()).toBeVisible({ timeout: 10_000 });
    await page.context().close();
  });

  test.afterAll(() => {
    if (existsSync(pdfPath)) unlinkSync(pdfPath);
  });
});
