import { test, expect, type Page, type Browser } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { execFileSync } from 'node:child_process';
import { mkdirSync, existsSync, unlinkSync, readFileSync } from 'node:fs';

/**
 * Vendedor monta pedido pra cliente com 2 endereços cadastrados:
 *  1. via service role: cria cliente com CNPJ "00.000.000/0001-00" + 2 endereços
 *     (um cujo endereço bate com o do sample PDF, outro diferente)
 *  2. vendedor sobe sample PDF (CNPJ 00.000.000/0001-00)
 *  3. confirma seletor visível com 2 opções
 *  4. confirma auto-match: opção "Padrão" (que bate com o PDF) está pré-selecionada
 *  5. troca pra outro endereço → snapshot fields atualizam
 *  6. cleanup
 */

const SAMPLES_DIR = './.samples';
const PASSWORD = process.env.SEED_PASSWORD ?? 'Franzoni@2026';
const VENDAS1 = process.env.VENDAS1_EMAIL ?? 'vendas1@franzoni.local';

function svc() {
  const env = readFileSync('../.env.local', 'utf8');
  const get = (k: string) =>
    (env.match(new RegExp(`^${k}=(.*)$`, 'm'))?.[1] ?? '').trim().replace(/^["']|["']$/g, '');
  return createClient(get('NEXT_PUBLIC_SUPABASE_URL'), get('SUPABASE_SERVICE_ROLE_KEY'));
}

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

test.describe('Seletor de endereço — vendedor', () => {
  const sb = svc();
  // sample PDF: cliente "QA AUTO TEST LTDA" CNPJ "00.000.000/0001-00", endereço "Rua Playwright, 1"
  const cnpj = '00.000.000/0001-00';
  const docId = `QA-VEND-${Date.now()}`;
  const pdfPath = `${SAMPLES_DIR}/${docId}.pdf`;
  let clienteId = '';

  test.beforeAll(async () => {
    mkdirSync(SAMPLES_DIR, { recursive: true });
    // limpa eventual cadastro residual (idempotente)
    await sb.from('clientes').delete().eq('cnpj_cpf', cnpj);
    // cria cliente + 2 endereços
    const { data, error } = await sb
      .from('clientes')
      .insert({ nome: 'QA AUTO TEST LTDA', cnpj_cpf: cnpj })
      .select('id')
      .single();
    if (error || !data) throw new Error(`setup cliente: ${error?.message}`);
    clienteId = data.id as string;
    const ins = await sb.from('cliente_enderecos').insert([
      {
        cliente_id: clienteId,
        rotulo: 'Sede QA',
        endereco: 'Rua Playwright, 1', // bate com o sample PDF
        bairro: 'Bairro Teste',
        cidade: 'SÃO JOSÉ',
        uf: 'SC',
        cep: '88000-000',
        is_padrao: true,
      },
      {
        cliente_id: clienteId,
        rotulo: 'Obra QA',
        endereco: 'Avenida Outra, 999',
        bairro: 'Outro Bairro',
        cidade: 'FLORIANÓPOLIS',
        uf: 'SC',
        cep: '88010-000',
        is_padrao: false,
      },
    ]);
    if (ins.error) throw new Error(`setup enderecos: ${ins.error.message}`);
  });

  test('seletor aparece, auto-match na opção padrão, troca atualiza snapshot', async ({ browser }) => {
    execFileSync('python3', ['scripts/make-sample-pdf.py', pdfPath, docId], { stdio: 'inherit' });
    const page = await loginVendas1(browser);
    await page.goto('/vendas/novo');
    await page.locator('input[type="file"]').setInputFiles(pdfPath);
    await page.getByRole('button', { name: /processar pdf/i }).click();
    await expect(page.getByText(/revisar pedido/i)).toBeVisible({ timeout: 30_000 });

    // O EnderecoSelector é o primeiro select que CONTÉM "Outro endereço"
    const selector = page
      .locator('select')
      .filter({ has: page.locator('option', { hasText: /outro endereço/i }) })
      .first();
    await expect(selector).toBeVisible({ timeout: 10_000 });
    // Espera o hook fetchar os endereços cadastrados
    await expect(selector.locator('option')).toHaveCount(3, { timeout: 10_000 });
    const optTexts = await selector.locator('option').allTextContents();
    expect(optTexts.some((o) => /sede qa/i.test(o))).toBe(true);
    expect(optTexts.some((o) => /obra qa/i.test(o))).toBe(true);

    // Espera o auto-match terminar (selectedOption deixa de ser '')
    await expect(async () => {
      const v = await selector.inputValue();
      expect(v).not.toBe('');
    }).toPass({ timeout: 5_000 });

    // O endereço da Sede QA bate com o PDF → snapshot deve ter "Rua Playwright, 1"
    const enderecoInput = page.locator('input[name="cliente_endereco"]');
    await expect(enderecoInput).toHaveValue('Rua Playwright, 1');

    // Troca pro "Obra QA" → snapshot atualiza
    const options = await selector.locator('option').allTextContents();
    const obraOption = options.find((o) => /obra qa/i.test(o));
    if (!obraOption) throw new Error(`Não achou opção 'Obra QA' em: ${options.join('|')}`);
    await selector.selectOption({ label: obraOption });
    await expect(enderecoInput).toHaveValue('Avenida Outra, 999');
    await expect(page.locator('input[name="cliente_bairro"]')).toHaveValue('Outro Bairro');
    await expect(page.locator('input[name="cliente_cidade"]')).toHaveValue('FLORIANÓPOLIS');

    // Seleciona "Outro endereço" (string vazia) → não deve estourar
    await selector.selectOption('');
    // O botão "Salvar como novo endereço" deve aparecer
    await expect(page.getByRole('button', { name: /salvar como novo endereço/i })).toBeVisible();

    await page.context().close();
  });

  test.afterAll(async () => {
    if (existsSync(pdfPath)) unlinkSync(pdfPath);
    if (clienteId) await sb.from('clientes').delete().eq('id', clienteId);
  });
});
