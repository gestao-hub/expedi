import { test, expect, devices } from '@playwright/test';
import { PROFILES, authStateFile, initialUrlFor } from './profiles';

/**
 * Visual + overflow:
 *  - Cada perfil em cada viewport visita as rotas básicas
 *  - Detecta overflow horizontal (scrollWidth > clientWidth)
 *  - Detecta elementos com width > viewport
 *  - Salva screenshot quando algo falha
 */
const VIEWPORTS = [
  { name: 'mobile-375',  width: 375,  height: 667  },
  { name: 'mobile-414',  width: 414,  height: 896  },
  { name: 'tablet-768',  width: 768,  height: 1024 },
  { name: 'desktop-1440', width: 1440, height: 900  },
  { name: 'desktop-1920', width: 1920, height: 1080 },
];

const ROUTES_PER_ROLE: Record<'admin' | 'vendedor' | 'logistica', string[]> = {
  admin:     ['/admin', '/vendas', '/vendas/novo', '/logistica', '/historico', '/admin/usuarios'],
  vendedor:  ['/vendas', '/vendas/novo', '/historico'],
  logistica: ['/logistica', '/historico'],
};

for (const profile of PROFILES.filter((p) => ['admin', 'vendas1', 'logistica'].includes(p.id))) {
  for (const vp of VIEWPORTS) {
    test.describe(`Visual · ${profile.id} · ${vp.name}`, () => {
      test.use({
        storageState: authStateFile(profile.id),
        viewport: { width: vp.width, height: vp.height },
      });

      for (const path of ROUTES_PER_ROLE[profile.role]) {
        test(`${path} sem overflow horizontal`, async ({ page }) => {
          await page.goto(path, { waitUntil: 'networkidle' });
          await page.waitForTimeout(300); // anima entrada

          // 1) Overflow horizontal global
          const overflow = await page.evaluate(() => {
            const doc = document.documentElement;
            return {
              scrollW: doc.scrollWidth,
              clientW: doc.clientWidth,
              bodyScrollW: document.body.scrollWidth,
            };
          });
          expect(
            overflow.scrollW,
            `${path}@${vp.name}: overflow horizontal (scrollW=${overflow.scrollW} vs clientW=${overflow.clientW})`,
          ).toBeLessThanOrEqual(overflow.clientW + 1);

          // 2) Nenhum elemento ultrapassa o viewport horizontalmente
          const offscreen = await page.evaluate((vw) => {
            const elements = Array.from(document.querySelectorAll('*'));
            const out: { tag: string; cls: string; right: number }[] = [];
            for (const el of elements) {
              const r = el.getBoundingClientRect();
              // ignora elementos posicionados intencionalmente fora da tela
              const styles = window.getComputedStyle(el);
              if (styles.position === 'fixed' && r.right > vw + 5) {
                // posicionado off-screen de propósito (drawer fechado, etc.)
                if (styles.transform.includes('matrix') || styles.visibility === 'hidden') continue;
              }
              if (r.width > 0 && r.right > vw + 2 && r.left < vw) {
                out.push({
                  tag: el.tagName.toLowerCase(),
                  cls: (el as HTMLElement).className?.toString?.().slice(0, 60) ?? '',
                  right: Math.round(r.right),
                });
              }
            }
            return out.slice(0, 5);
          }, vp.width);

          expect(offscreen, `${path}@${vp.name}: elementos ultrapassam o viewport`).toEqual([]);
        });
      }
    });
  }
}
