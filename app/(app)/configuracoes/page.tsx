import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/layout/page-header';
import { WhatsappConfig, type ComunicacaoRow } from '@/components/whatsapp-config';

/** Configurações da empresa (admin): conexão de WhatsApp + comunicação enviada. */
export default async function ConfiguracoesPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: perfil } = await supabase
    .from('profiles').select('role, empresa_id').eq('id', user.id).single();
  if (perfil?.role !== 'admin' || !perfil.empresa_id) redirect('/');

  const [{ data: empresa }, { data: notifs }] = await Promise.all([
    supabase.from('empresas').select('notif_whatsapp_ativo').eq('id', perfil.empresa_id).single(),
    supabase
      .from('os_notificacoes')
      .select('id, canal, tipo, destino, status, agendada_para, enviada_em, erro')
      .order('created_at', { ascending: false })
      .limit(50),
  ]);

  return (
    <>
      <PageHeader title="Configurações" description="Conecte seu WhatsApp e acompanhe as mensagens enviadas aos clientes." />
      <WhatsappConfig
        conectadoInicial={!!empresa?.notif_whatsapp_ativo}
        comunicacoes={(notifs ?? []) as ComunicacaoRow[]}
      />
    </>
  );
}
