import { chromium, type FullConfig } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { PROFILES, PASSWORD, authStateFile, initialUrlFor } from './profiles';

export default async function globalSetup(_config: FullConfig) {
  mkdirSync('./.auth', { recursive: true });
  const baseURL = process.env.BASE_URL ?? 'https://franzoni.vercel.app';

  const browser = await chromium.launch();
  try {
    for (const p of PROFILES) {
      const ctx = await browser.newContext({ baseURL });
      const page = await ctx.newPage();
      await page.goto('/login', { waitUntil: 'domcontentloaded' });

      await page.getByLabel(/e-?mail/i).fill(p.email);
      await page.getByLabel(/senha/i).fill(PASSWORD);
      await Promise.all([
        page.waitForURL(new RegExp(initialUrlFor(p.role).replace('/', '\\/') + '($|\\?)')),
        page.getByRole('button', { name: /entrar/i }).click(),
      ]);

      await ctx.storageState({ path: authStateFile(p.id) });
      console.log(`[auth] ${p.id} (${p.role}) → OK`);
      await ctx.close();
    }
  } finally {
    await browser.close();
  }
}
