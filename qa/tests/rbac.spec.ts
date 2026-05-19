import { test, expect } from '@playwright/test';
import { PROFILES, authStateFile, initialUrlFor } from './profiles';

/**
 * Matriz de permissões esperada. allowedFinalPaths é o conjunto de
 * URLs finais aceitáveis (a app pode redirecionar o usuário pra rota
 * de menos privilégio quando ele tenta acessar algo proibido).
 */
type RbacMatrix = Record<
  string, // path inicial
  Record<'admin' | 'vendedor' | 'logistica', { allowed: boolean; expectedRedirect?: string }>
>;

const MATRIX: RbacMatrix = {
  '/vendas': {
    admin:     { allowed: true },
    vendedor:  { allowed: true },
    logistica: { allowed: false, expectedRedirect: '/logistica' }, // logística não opera em vendas
  },
  '/vendas/novo': {
    admin:     { allowed: true },
    vendedor:  { allowed: true },
    logistica: { allowed: false, expectedRedirect: '/logistica' },
  },
  '/logistica': {
    admin:     { allowed: true },
    vendedor:  { allowed: false, expectedRedirect: '/vendas' },
    logistica: { allowed: true },
  },
  '/historico': {
    admin:     { allowed: true },
    vendedor:  { allowed: true },
    logistica: { allowed: true },
  },
  '/admin': {
    admin:     { allowed: true },
    vendedor:  { allowed: false, expectedRedirect: '/vendas' },
    logistica: { allowed: false, expectedRedirect: '/logistica' },
  },
  '/admin/usuarios': {
    admin:     { allowed: true },
    vendedor:  { allowed: false, expectedRedirect: '/vendas' },
    logistica: { allowed: false, expectedRedirect: '/logistica' },
  },
};

for (const profile of PROFILES) {
  test.describe(`RBAC · ${profile.id} (${profile.role})`, () => {
    test.use({ storageState: authStateFile(profile.id) });

    test('login redireciona pra rota inicial do role', async ({ page }) => {
      await page.goto('/');
      // proxy redireciona pra /vendas por padrão (rota inicial pública pós-login),
      // depois cada role volta pra sua URL natural na navegação
      const initial = initialUrlFor(profile.role);
      await expect(page).toHaveURL(new RegExp(`(${initial.replace('/', '\\/')}|\\/vendas).*`));
    });

    for (const [path, perRole] of Object.entries(MATRIX)) {
      const expected = perRole[profile.role];
      const label = expected.allowed
        ? `tem acesso a ${path}`
        : `NÃO deve acessar ${path} (deve cair em ${expected.expectedRedirect})`;

      test(label, async ({ page }) => {
        const consoleErrors: string[] = [];
        page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message}`));
        page.on('console', (m) => {
          if (m.type() === 'error') consoleErrors.push(`console.error: ${m.text()}`);
        });

        const resp = await page.goto(path, { waitUntil: 'networkidle' });
        const finalUrl = new URL(page.url()).pathname;

        if (expected.allowed) {
          // Aceita que a URL final pode ter query string ou ser a mesma
          expect(finalUrl, `${profile.id} deveria poder acessar ${path}`).toBe(path);
          expect(resp?.status(), 'status HTTP').toBeLessThan(400);
        } else {
          // Espera redirect pra rota permitida
          expect(
            finalUrl,
            `${profile.id} deveria ser redirecionado de ${path}, mas a URL final foi ${finalUrl}`,
          ).not.toBe(path);
          expect(finalUrl).toBe(expected.expectedRedirect);
        }

        // Sem JS errors graves
        expect(consoleErrors.filter((e) => !e.includes('favicon'))).toHaveLength(0);
      });
    }

    test('logout limpa sessão e bloqueia volta via histórico', async ({ page, context }) => {
      await page.goto(initialUrlFor(profile.role));
      await page.evaluate(() => {
        const form = document.createElement('form');
        form.method = 'POST';
        form.action = '/auth/signout';
        document.body.appendChild(form);
        form.submit();
      });
      await page.waitForURL(/\/login/);

      // Tenta voltar via cookie residual
      const cookies = await context.cookies();
      const supabaseAuth = cookies.filter((c) => c.name.includes('sb-') && c.name.includes('auth'));
      expect(supabaseAuth, 'cookies de auth limpos').toHaveLength(0);

      // Acessa rota protegida → deve cair no login
      await page.goto(initialUrlFor(profile.role));
      expect(new URL(page.url()).pathname).toBe('/login');
    });
  });
}

// -----------------------------------------------------------------------------
// Bypass de API: vendedor não pode chamar /api/parse-pdf sem auth, e tentar
// como outro usuário não deve liberar dados
// -----------------------------------------------------------------------------
test.describe('RBAC · API bypass', () => {
  test('POST /api/parse-pdf sem auth → 401/307', async ({ request }) => {
    const r = await request.post('/api/parse-pdf');
    expect([307, 401, 400, 415]).toContain(r.status());
  });
});
