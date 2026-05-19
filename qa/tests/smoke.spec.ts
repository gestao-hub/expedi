import { test, expect } from '@playwright/test';
import { PROFILES, authStateFile, initialUrlFor } from './profiles';

/**
 * Smoke: cada perfil carrega sua rota inicial + algumas auxiliares.
 * Captura erros de console / pageerror / responses 4xx/5xx.
 */
for (const profile of PROFILES) {
  test.describe(`Smoke · ${profile.id} (${profile.role})`, () => {
    test.use({ storageState: authStateFile(profile.id) });

    const routesPerRole: Record<typeof profile.role, string[]> = {
      admin:     ['/admin', '/vendas', '/vendas/novo', '/logistica', '/historico', '/admin/usuarios'],
      vendedor:  ['/vendas', '/vendas/novo', '/historico'],
      logistica: ['/logistica', '/logistica?status=em_separacao', '/logistica?status=finalizado', '/historico'],
    };

    for (const path of routesPerRole[profile.role]) {
      test(`carrega ${path} sem erros`, async ({ page }) => {
        const consoleErrors: string[] = [];
        const failedRequests: { url: string; status: number }[] = [];
        page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message}`));
        page.on('console', (m) => {
          if (m.type() === 'error') consoleErrors.push(`console.error: ${m.text()}`);
        });
        page.on('response', (r) => {
          if (r.status() >= 400 && !r.url().includes('favicon')) {
            failedRequests.push({ url: r.url(), status: r.status() });
          }
        });

        const resp = await page.goto(path, { waitUntil: 'networkidle' });
        expect(resp?.status(), `${path} status`).toBeLessThan(400);

        // Página tem conteúdo (não é shell vazio)
        const body = await page.locator('body').innerText();
        expect(body.length, 'tem texto').toBeGreaterThan(50);

        expect(consoleErrors, 'sem erros de console').toEqual([]);
        expect(failedRequests, 'sem requests 4xx/5xx').toEqual([]);
      });
    }
  });
}
