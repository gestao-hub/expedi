// Resolve URL/chaves do Supabase em RUNTIME (server-side). `SUPABASE_URL`/`SUPABASE_ANON_KEY`
// são envs NÃO-públicas — o Next nunca as assa (baked) no bundle, então são lidas de verdade em
// runtime (no hub local = gateway; na Vercel caem no fallback NEXT_PUBLIC_*).
export function supabaseUrl(): string {
  return process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
}
export function supabaseAnonKey(): string {
  return process.env.SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
}
export function supabaseServiceKey(): string {
  return process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
}
