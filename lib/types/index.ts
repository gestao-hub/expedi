/**
 * Re-exports convenientes para os tipos do banco.
 * Depois do typegen, esses aliases ficam corretamente tipados.
 */
import type { Database } from './database';

export type Tables<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Row'];
export type InsertTables<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Insert'];
export type UpdateTables<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Update'];
export type Enums<T extends keyof Database['public']['Enums']> =
  Database['public']['Enums'][T];

export type Profile           = Tables<'profiles'>;
export type Pedido            = Tables<'pedidos'>;
export type PontoRetirada     = Tables<'pedido_pontos_retirada'>;
export type PedidoItem        = Tables<'pedido_itens'>;
export type PedidoLogistica   = Tables<'pedido_logistica'>;
export type PedidoEvento      = Tables<'pedido_eventos'>;
export type UserRole          = Enums<'user_role'>;
export type PedidoStatus      = Enums<'pedido_status'>;
export type PontoRetiradaTipo = Enums<'ponto_retirada_tipo'>;
