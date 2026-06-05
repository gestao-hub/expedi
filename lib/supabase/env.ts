// Resolve URL/chaves do Supabase em RUNTIME (server-side). `SUPABASE_URL`/`SUPABASE_ANON_KEY`
// são envs NÃO-públicas — o Next nunca as assa (baked) no bundle, então são lidas de verdade em
// runtime (no hub local = gateway; na Vercel caem no fallback NEXT_PUBLIC_*).
/**
 * Nome FIXO do cookie de sessão (storageKey do supabase-js).
 * No hub, o servidor (gateway interno) e o navegador (window.location.origin) usam URLs
 * DIFERENTES — sem um nome fixo, o @supabase/ssr deriva nomes de cookie distintos e a sessão
 * do login não é lida pelo client (a query cai pra `anon`). Fixar o nome alinha servidor,
 * middleware e navegador. Tem que ser IGUAL nos três clients.
 */
export const SUPABASE_COOKIE_NAME = 'exped-auth';

export function supabaseUrl(): string {
  return process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
}
export function supabaseAnonKey(): string {
  return process.env.SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
}
export function supabaseServiceKey(): string {
  return process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
}
