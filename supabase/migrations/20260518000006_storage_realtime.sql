-- Migration 06: Storage bucket de PDFs + realtime publication

-- Bucket privado para os PDFs dos pedidos
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'pedidos-pdfs',
  'pedidos-pdfs',
  false,
  10485760,                       -- 10 MB
  array['application/pdf']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Policies do Storage: usuário só lê/escreve seus próprios PDFs;
-- logística e admin leem qualquer um.
drop policy if exists "pdfs_owner_write" on storage.objects;
drop policy if exists "pdfs_owner_read"  on storage.objects;
drop policy if exists "pdfs_staff_read"  on storage.objects;

create policy "pdfs_owner_write" on storage.objects
  for all to authenticated
  using  (bucket_id = 'pedidos-pdfs' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'pedidos-pdfs' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "pdfs_staff_read" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'pedidos-pdfs'
    and current_user_role() in ('admin', 'logistica')
  );

-- Realtime: publica as tabelas que o front escuta (idempotente)
do $$ begin
  alter publication supabase_realtime add table public.pedidos;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.pedido_eventos;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.pedido_logistica;
exception when duplicate_object then null; end $$;
