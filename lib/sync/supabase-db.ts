import type { createAdminClient } from '@/lib/supabase/admin';
import type { Json } from '@/lib/types/database';
import type { SyncDb, Row } from './engine';
import { hasDirectEmpresaId, scopeColumn, type SyncTable } from './tables';

type Admin = ReturnType<typeof createAdminClient>;

/**
 * Implementação de SyncDb sobre o supabase-js (service_role).
 *
 * Escopo por empresa:
 *  - selectChanges: tabelas com empresa_id direto filtram por coluna; filhas
 *    (sem empresa_id) filtram por subquery `parent_fk in (ids da empresa)` resolvida
 *    em memória (cadeia até o ancestral com empresa_id).
 *  - findCanonical/parentBelongsToEmpresa: idem.
 *
 * Escrita do merge sem o trigger recarimbar: via RPC `sync_push_upsert` que faz
 * `set local exped.sync = 'on'` na MESMA transação do upsert (GUC custom, não exige
 * superuser; o trigger stamp_sync pula o recarimbo quando essa flag está 'on' —
 * ver supabase/migrations/20260601000002_sync_rpc.sql e 20260601000003_sync_guc_trigger.sql).
 * `setSyncReplica` aqui é no-op porque o toggle é por-transação dentro do RPC
 * (REST/pool não mantém sessão entre requests).
 */

export function makeSupabaseSyncDb(supabase: Admin): SyncDb {
  return {
    async selectChanges(table, empresaId, cursor, limit) {
      // Filhas (sem empresa_id direto): escopo via RPC com JOIN no banco — evita carregar
      // todos os IDs da empresa em memória + .in() gigante.
      if (!hasDirectEmpresaId(table)) {
        const { data, error } = await supabase.rpc('sync_children_changed', {
          p_table: table,
          p_empresa: empresaId,
          p_cursor: cursor,
          p_limit: limit,
        });
        if (error) throw error;
        return (data ?? []) as unknown as Row[];
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from(table)
        .select('*')
        .gt('updated_at', cursor)
        .eq(scopeColumn(table), empresaId)
        .order('updated_at', { ascending: true })
        .limit(limit);
      if (error) throw error;
      return (data ?? []) as Row[];
    },

    async findCanonical(table: SyncTable, empresaId, pk) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let q = (supabase as any).from(table.name).select('*').eq(table.pk, pk);
      if (hasDirectEmpresaId(table.name)) q = q.eq(scopeColumn(table.name), empresaId);
      const { data, error } = await q.maybeSingle();
      if (error) throw error;
      if (!data) return null;
      // Filha: confere o ancestral.
      if (!hasDirectEmpresaId(table.name) && table.parent) {
        const ok = await this.parentBelongsToEmpresa(
          table.parent.table,
          (data as Row)[table.parent.fk],
          empresaId,
        );
        if (!ok) return null;
      }
      return data as Row;
    },

    async findCanonicalGlobal(table: SyncTable, pk) {
      // Existência GLOBAL por PK, SEM filtro de empresa (detecção de colisão
      // cross-tenant). service_role ignora RLS, então enxerga linhas de qualquer
      // empresa de propósito aqui.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from(table.name)
        .select('*')
        .eq(table.pk, pk)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as Row | null;
    },

    async parentBelongsToEmpresa(parentTable, parentId, empresaId) {
      const { data, error } = await supabase.rpc('sync_parent_in_empresa', {
        p_table: parentTable,
        p_id: parentId as string,
        p_empresa: empresaId,
      });
      if (error) throw error;
      return data === true;
    },

    async parentsInEmpresa(parentTable, parentIds, empresaId) {
      const set = new Set<string>();
      const ids = [...new Set(parentIds.map((x) => x as string).filter(Boolean))];
      if (ids.length === 0) return set;
      const { data, error } = await supabase.rpc('sync_parents_in_empresa', {
        p_table: parentTable,
        p_ids: ids,
        p_empresa: empresaId,
      });
      if (error) throw error;
      for (const id of (data ?? []) as string[]) set.add(String(id));
      return set;
    },

    async findCanonicalMany(table, empresaId, pks) {
      const map = new Map<string, Row>();
      const ids = [...new Set(pks.map((x) => x as string).filter(Boolean))];
      if (ids.length === 0) return map;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let q = (supabase as any).from(table.name).select('*').in(table.pk, ids);
      if (hasDirectEmpresaId(table.name)) q = q.eq(scopeColumn(table.name), empresaId);
      const { data, error } = await q;
      if (error) throw error;
      let rows = (data ?? []) as Row[];
      if (!hasDirectEmpresaId(table.name) && table.parent) {
        const parentIds = rows.map((r) => r[table.parent!.fk]);
        const valid = await this.parentsInEmpresa(table.parent.table, parentIds, empresaId);
        rows = rows.filter((r) => valid.has(String(r[table.parent!.fk])));
      }
      for (const r of rows) map.set(String(r[table.pk]), r);
      return map;
    },

    async upsertRaw(table, row) {
      const { data, error } = await supabase.rpc('sync_push_upsert', {
        p_table: table,
        p_row: row as Json,
      });
      if (error) throw error;
      // RETURNING vazio (null) = guarda `where empresa_id` no RPC bloqueou um UPDATE
      // de linha de outra empresa (takeover cross-tenant). O engine traduz em 403.
      return (data ?? null) as Row | null;
    },

    async setSyncReplica() {
      // No-op: o toggle do trigger (GUC exped.sync) é feito por-transação DENTRO do
      // RPC sync_push_upsert. (PostgREST usa pool de conexões; um SET fora da
      // transação do upsert não persistiria.)
    },

    async selectAuthUsers(empresaId, cursor, limit) {
      // PostgREST da nuvem NÃO expõe o schema `auth` (e expô-lo vazaria hashes de senha).
      // Usamos a RPC SECURITY DEFINER public.sync_auth_users, que lê auth.users por dentro,
      // escopada na empresa server-side, e devolve só as colunas do GoTrue (incl. hash).
      const { data, error } = await supabase.rpc('sync_auth_users', {
        p_empresa: empresaId,
        p_cursor: cursor,
        p_limit: limit,
      });
      if (error) throw error;
      return ((data ?? []) as unknown[]).map((r) => r as Row);
    },
  };
}
