#!/usr/bin/env bash
# Gera as chaves anon e service_role (JWT HS256) assinadas com a JWT secret
# local, sem expiração. Usadas pelo supabase-js como apikey + Bearer fallback.
#
# Uso:
#   scripts/local-stack/make-keys.sh            # imprime anon + service_role
#   scripts/local-stack/make-keys.sh anon       # só a anon
#   scripts/local-stack/make-keys.sh service    # só a service_role
#
# Mantemos em Python puro (sem PyJWT) pra não depender de nada externo.
set -euo pipefail

SECRET="${GOTRUE_JWT_SECRET:-exped-local-super-secret-jwt-with-at-least-32-chars}"

gen() {
  local role="$1"
  SECRET="$SECRET" ROLE="$role" python3 - <<'PY'
import base64, hashlib, hmac, json, os

secret = os.environ["SECRET"].encode()
role = os.environ["ROLE"]

def b64url(b: bytes) -> str:
    return base64.urlsafe_b64encode(b).rstrip(b"=").decode()

header = {"alg": "HS256", "typ": "JWT"}
# Sem 'exp' -> token não expira (apenas spike local).
payload = {"role": role, "iss": "exped-local"}

segs = b64url(json.dumps(header, separators=(",", ":")).encode()) + "." + \
       b64url(json.dumps(payload, separators=(",", ":")).encode())
sig = hmac.new(secret, segs.encode(), hashlib.sha256).digest()
print(segs + "." + b64url(sig))
PY
}

case "${1:-all}" in
  anon) gen anon ;;
  service|service_role) gen service_role ;;
  all)
    echo "ANON_KEY=$(gen anon)"
    echo "SERVICE_ROLE_KEY=$(gen service_role)"
    ;;
  *) echo "uso: $0 [anon|service|all]" >&2; exit 1 ;;
esac
