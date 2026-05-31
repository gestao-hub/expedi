#!/usr/bin/env bash
set -euo pipefail

# Bootstrap do banco do app (exped) num Postgres LOCAL nativo, na ORDEM REAL do
# Supabase: o GoTrue (Supabase Auth) é dono do schema `auth` e roda as migrations
# DELE primeiro, criando auth.users completo; só então as migrations do app rodam
# por cima (elas referenciam auth.users e auth.uid()).
#
# Ordem:
#   1. recria o banco exped do zero
#   2. 00-roles-ext.sql ...... extensões + roles + supabase_auth_admin + schema auth VAZIO
#   3. GoTrue `auth migrate` .. cria auth.users e demais tabelas do auth (23 tabelas)
#   4. 00-prelude-helpers.sql . helpers auth.uid()/role()/jwt() + grants + storage + realtime
#   5. supabase/migrations/* .. schema do app + RLS
#
# Variáveis (defaults pro cluster isolado deste spike):
#   PGPORT  porta do cluster        (default 54329)
#   PGHOST  host/socket dir         (default /tmp/exped-pg)
#   PGUSER  superuser do cluster    (default postgres)
#   PGDB    banco do app            (default exped)
#
# Pré-requisito: binário do GoTrue em scripts/local-stack/bin/auth (+ migrations/),
# baixado de github.com/supabase/auth/releases (asset linux x86 = amd64).
#
# Idempotente: dropa e recria o banco do app do zero a cada execução.

PORT="${PGPORT:-54329}"
HOST="${PGHOST:-/tmp/exped-pg}"
SUSER="${PGUSER:-postgres}"
DB="${PGDB:-exped}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
LS="$ROOT/scripts/local-stack"

PSQL=(psql -p "$PORT" -h "$HOST" -U "$SUSER" -v ON_ERROR_STOP=1)

echo ">> recriando banco $DB (encerra conexões abertas, ex. PostgREST)"
psql -p "$PORT" -h "$HOST" -U "$SUSER" -d postgres -v ON_ERROR_STOP=1 \
  -c "select pg_terminate_backend(pid) from pg_stat_activity where datname='$DB' and pid<>pg_backend_pid();" >/dev/null
psql -p "$PORT" -h "$HOST" -U "$SUSER" -d postgres -v ON_ERROR_STOP=1 \
  -c "drop database if exists $DB" \
  -c "create database $DB"

echo ">> (1) roles + extensões + supabase_auth_admin + schema auth vazio (00-roles-ext.sql)"
"${PSQL[@]}" -d "$DB" -f "$LS/00-roles-ext.sql"

echo ">> (2) GoTrue migrate — cria auth.users e tabelas do auth"
set -a; source "$LS/gotrue.env"; set +a
( cd "$ROOT" && "$LS/bin/auth" migrate ) 2>&1 | grep -iE "applied|fatal|error" | tail -5

echo ">> (3) helpers auth.* + grants + storage + realtime (00-prelude-helpers.sql)"
"${PSQL[@]}" -d "$DB" -f "$LS/00-prelude-helpers.sql"

echo ">> (4) migrations do app"
for f in "$ROOT"/supabase/migrations/*.sql; do
  echo "   - $(basename "$f")"
  "${PSQL[@]}" -d "$DB" -f "$f"
done

echo "schema aplicado (auth via GoTrue + app via migrations)."
echo ">> lembre de recarregar o cache do PostgREST: kill -USR1 <pid> (DB foi recriado)"
