#!/usr/bin/env bash
# Load seed.ldif into local OpenLDAP (idempotent-ish: fails if already seeded).
set -euo pipefail
cd "$(dirname "$0")"

HOST="${LDAP_HOST:-ldap://127.0.0.1:389}"
ADMIN_DN="${LDAP_ADMIN_DN:-cn=admin,dc=example,dc=com}"
ADMIN_PW="${LDAP_ADMIN_PASSWORD:-adminpass}"

ldapadd -x -H "$HOST" -D "$ADMIN_DN" -w "$ADMIN_PW" -f seed.ldif
echo "Seeded OU people/groups + service, jdoe, appadmin"
