import { NextResponse, type NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { hashToken } from '@/lib/crypto/token';
import { ingestOsSchema } from '@/lib/validators/ingest-os';
import { inserirOrdemServico } from '@/lib/os/inserir';

export const runtime = 'nodejs';
export const maxDuration = 30;
const MAX_BYTES = 10 * 1024 * 1024;
const BUCKET = 'pedidos-pdfs';

/** Ingestão de Ordem de Serviço (agente local). Auth por token de dispositivo → empresa. */
export async function POST(req: NextRequest) {
  const supabase = createAdminClient();

  const auth = req.headers.get('authorization') ?? '';
  const token = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : '';
  if (!token) return NextResponse.json({ error: 'Token ausente' }, { status: 401 });

  const { data: dispositivo } = await supabase
    .from('dispositivos').select('id, empresa_id, ativo').eq('token_hash', hashToken(token)).maybeSingle();
  if (!dispositivo || !dispositivo.ativo) {
    return NextResponse.json({ error: 'Dispositivo inválido ou inativo' }, { status: 401 });
  }
  const empresaId = dispositivo.empresa_id as string;
  await supabase.from('dispositivos').update({ last_seen_at: new Date().toISOString() }).eq('id', dispositivo.id);

  let form: FormData;
  try { form = await req.formData(); }
  catch { return NextResponse.json({ error: 'Esperado multipart/form-data' }, { status: 400 }); }
  const file = form.get('file');
  const dadosRaw = form.get('dados');
  if (typeof dadosRaw !== 'string') return NextResponse.json({ error: 'Campo "dados" ausente' }, { status: 400 });
  let parsedJson: unknown;
  try { parsedJson = JSON.parse(dadosRaw); }
  catch { return NextResponse.json({ error: '"dados" não é JSON válido' }, { status: 400 }); }
  const dados = ingestOsSchema.safeParse(parsedJson);
  if (!dados.success) {
    return NextResponse.json({ error: dados.error.issues[0]?.message ?? 'dados inválidos' }, { status: 422 });
  }
  const d = dados.data;

  // vendedor/responsável Hiper → Expedi
  const { data: map } = await supabase
    .from('hiper_vendedor_map').select('vendedor_id')
    .eq('empresa_id', empresaId).eq('hiper_usuario_id', d.hiper_usuario_id).maybeSingle();
  const vendedorId = map?.vendedor_id as string | undefined;
  if (!vendedorId) {
    return NextResponse.json({ error: `Usuário Hiper ${d.hiper_usuario_id} não mapeado para esta empresa` }, { status: 422 });
  }

  // PDF opcional (só armazena)
  let storagePdfPath: string | null = null;
  if (file instanceof File) {
    if (file.size > MAX_BYTES) return NextResponse.json({ error: 'PDF acima de 10 MB' }, { status: 413 });
    const buffer = Buffer.from(await file.arrayBuffer());
    const path = `hiper-sync/${empresaId}/os-${d.documento_erp ?? 'sem-doc'}-${Date.now()}.pdf`;
    const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, buffer, { contentType: 'application/pdf', upsert: false });
    if (!upErr) storagePdfPath = path;
  }

  const r = await inserirOrdemServico(supabase, d, { vendedorId, empresaId, storagePdfPath });
  if ('error' in r) return NextResponse.json(r, { status: 500 });
  if ('duplicate' in r) return NextResponse.json({ duplicate: true, id: r.existing_id }, { status: 200 });
  return NextResponse.json({ id: r.id }, { status: 201 });
}
