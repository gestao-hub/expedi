import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';

describe('clients Supabase são endpoint-driven', () => {
  beforeEach(() => { vi.resetModules(); });

  it('nenhum client embute URL de produção .supabase.co/.in', () => {
    for (const f of ['lib/supabase/server.ts','lib/supabase/client.ts','lib/supabase/admin.ts','lib/supabase/middleware.ts']) {
      const src = readFileSync(f, 'utf8');
      expect(src, `${f} não pode ter URL fixa`).not.toMatch(/https:\/\/[a-z0-9]+\.supabase\.(co|in)/);
    }
  });

  it('admin expõe createAdminClient como função', async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://127.0.0.1:54321';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service';
    const mod = await import('@/lib/supabase/admin');
    expect(typeof mod.createAdminClient).toBe('function');
  });
});
