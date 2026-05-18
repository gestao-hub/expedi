/**
 * STUB temporário — substitua rodando:
 *   npx supabase login
 *   npx supabase link --project-ref louaguxcohfeicxxqggw
 *   npx supabase gen types typescript --linked > lib/types/database.ts
 *
 * Esse arquivo só existe para os clients Supabase compilarem antes do
 * primeiro typegen. Depois do typegen, o conteúdo daqui é totalmente
 * substituído pelos tipos auto-gerados.
 */
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

// Permissivo até o typegen rodar:
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Database = any;
