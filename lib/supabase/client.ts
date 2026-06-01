import { createBrowserClient } from '@supabase/ssr';
import type { Database } from '@/lib/types/database';

/**
 * Cliente Supabase para uso em Client Components e código que roda no browser.
 * Lê NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY.
 */
export function createClient() {
  // Turbopack não bake-in NEXT_PUBLIC_* nos client chunks. Fallback para
  // window.__SUPABASE_* injetado pelo layout servidor (ver app/layout.tsx).
  const url =
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    (typeof window !== 'undefined' ? (window as Window & { __SUPABASE_URL__?: string }).__SUPABASE_URL__ : '') ||
    '';
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    (typeof window !== 'undefined' ? (window as Window & { __SUPABASE_ANON_KEY__?: string }).__SUPABASE_ANON_KEY__ : '') ||
    '';
  return createBrowserClient<Database>(url, key);
}
