import { test, expect, type Page, type Browser } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdirSync, existsSync, unlinkSync } from 'node:fs';

/**
 * Atalho "Receber na entrega" na seção Pagamento:
 *  - marcar o checkbox preenche forma_pagamento = "ENTREGA A RECEBER"
 *  - desmarcar limpa
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

test.describe('Atalho de pagamento', () => {
  test.beforeAll(() => mkdirSync(SAMPLES_DIR, { recursive: true }));

  const docId = `QA-ATL-${Date.now()}`;
  const pdfPath = `${SAMPLES_DIR}/${docId}.pdf`;

  test('checkbox preenche/limpa forma_pagamento com "ENTREGA A RECEBER"', async ({ browser }) => {
    execFileSync('python3', ['scripts/make-sample-pdf.py', pdfPath, docId], { stdio: 'inherit' });
    const page = await loginVendas1(browser);
    await page.goto('/vendas/novo');
    await page.locator('input[type="file"]').setInputFiles(pdfPath);
    await page.getByRole('button', { name: /processar pdf/i }).click();
    await expect(page.getByText(/revisar pedido/i)).toBeVisible({ timeout: 30_000 });

    // Limpa o campo forma_pagamento (PDF de sample preenche "ENTREGA A RECEBER" automaticamente)
    const formaInput = page.locator('input[name="forma_pagamento"]');
    await formaInput.fill('');
    await expect(formaInput).toHaveValue('');

    // Marca o checkbox
    const cb = page.getByLabel(/receber na entrega/i);
    await cb.check();
    await expect(formaInput).toHaveValue('ENTREGA A RECEBER');

    // Desmarca → limpa
    await cb.uncheck();
    await expect(formaInput).toHaveValue('');

    // Edita manualmente pra outro valor → checkbox fica desmarcado
    await formaInput.fill('À VISTA');
    await expect(cb).not.toBeChecked();

    await page.context().close();
  });

  test.afterAll(() => {
    if (existsSync(pdfPath)) unlinkSync(pdfPath);
  });
});
