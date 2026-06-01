-- 20260601000022_empresa_logo_print.sql — logo p/ fundo claro (PDF/impressão)
-- empresas é tabela `down` no sync (pull select('*')) → a coluna desce ao hub sozinha.
alter table public.empresas add column if not exists logo_url_print text;
