'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  criarInstancia, conectarInstancia, statusInstancia, desconectarInstancia, estaConectado,
} from '@/lib/notificacoes/uazapi-admin';

export type ConexaoResult =
  | { ok: true; status: string | null; conectado: boolean; qrcode: string | null; paircode: string | null }
  | { error: string };

const BASE = (process.env.UAZAPI_URL ?? 'https://grupoide.uazapi.com').replace(/\/$/, '');

/** Sessão admin de uma empresa → {empresaId, nome, uazapi_token}. */
async function ctx() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: 'Não autenticado' };
  const { data: perfil } = await supabase.from('profiles').select('role, empresa_id').eq('id', user.id).single();
  if (perfil?.role !== 'admin' || !perfil.empresa_id)
    return { ok: false as const, error: 'Apenas o admin da empresa pode configurar o WhatsApp' };
  const admin = createAdminClient();
  const { data: emp } = await admin
    .from('empresas').select('id, nome, uazapi_token').eq('id', perfil.empresa_id).single();
  if (!emp) return { ok: false as const, error: 'Empresa não encontrada' };
  return { ok: true as const, admin, empresaId: emp.id as string, nome: emp.nome as string, token: emp.uazapi_token as string | null };
}

/** Garante que a empresa tem uma instância (cria se faltar) e devolve o token dela. */
async function garantirInstancia(c: { admin: ReturnType<typeof createAdminClient>; empresaId: string; nome: string; token: string | null }) {
  if (c.token) return { token: c.token };
  const novo = await criarInstancia(c.nome);
  if ('error' in novo) return novo;
  const { error } = await c.admin
    .from('empresas')
    .update({ uazapi_url: BASE, uazapi_token: novo.token })
    .eq('id', c.empresaId);
  if (error) return { error: error.message };
  return { token: novo.token };
}

/** Inicia a conexão: cria instância se preciso e retorna QR/pair code. */
export async function conectarWhatsappAction(): Promise<ConexaoResult> {
  const c = await ctx();
  if (!c.ok) return { error: c.error };
  const inst = await garantirInstancia(c);
  if ('error' in inst) return { error: inst.error };

  const r = await conectarInstancia(inst.token);
  if ('error' in r) return { error: r.error };
  const conectado = estaConectado(r.status);
  if (conectado) await c.admin.from('empresas').update({ notif_whatsapp_ativo: true }).eq('id', c.empresaId);
  revalidatePath('/configuracoes');
  return { ok: true, status: r.status, conectado, qrcode: r.qrcode, paircode: r.paircode };
}

/** Consulta o status (e QR atualizado). Liga notif_whatsapp_ativo quando conectar. */
export async function statusWhatsappAction(): Promise<ConexaoResult> {
  const c = await ctx();
  if (!c.ok) return { error: c.error };
  if (!c.token) return { ok: true, status: null, conectado: false, qrcode: null, paircode: null };

  const r = await statusInstancia(c.token);
  if ('error' in r) return { error: r.error };
  const conectado = estaConectado(r.status);
  await c.admin.from('empresas').update({ notif_whatsapp_ativo: conectado }).eq('id', c.empresaId);
  revalidatePath('/configuracoes');
  return { ok: true, status: r.status, conectado, qrcode: r.qrcode, paircode: r.paircode };
}

export async function desconectarWhatsappAction(): Promise<{ ok: true } | { error: string }> {
  const c = await ctx();
  if (!c.ok) return { error: c.error };
  if (c.token) {
    const r = await desconectarInstancia(c.token);
    if ('error' in r) return { error: r.error };
  }
  await c.admin.from('empresas').update({ notif_whatsapp_ativo: false }).eq('id', c.empresaId);
  revalidatePath('/configuracoes');
  return { ok: true };
}
