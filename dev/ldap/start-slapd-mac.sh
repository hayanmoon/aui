#!/usr/bin/env bash
# macOS: start OpenLDAP in Docker on 127.0.0.1:389.
# Same directory as the Debian slapd: dc=example,dc=com,
# admin cn=admin,dc=example,dc=com / adminpass.
set -euo pipefail

NAME="${LDAP_CONTAINER:-dev-ldap}"
PORT="${LDAP_PORT:-389}"
IMAGE="${LDAP_IMAGE:-osixia/openldap:1.5.0}"
HOST="${LDAP_HOST:-ldap://127.0.0.1:${PORT}}"
ADMIN_DN="${LDAP_ADMIN_DN:-cn=admin,dc=example,dc=com}"
ADMIN_PW="${LDAP_ADMIN_PASSWORD:-adminpass}"
BASE="${LDAP_SEARCH_BASE:-dc=example,dc=com}"

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker is required. Install Docker Desktop, then re-run." >&2
  exit 1
fi

wait_until_ready() {
  local i
  for i in $(seq 1 60); do
    if ldapsearch -x -LLL -H "$HOST" \
      -D "$ADMIN_DN" -w "$ADMIN_PW" \
      -b "$BASE" -s base dn >/dev/null 2>&1; then
      echo "slapd listening on ${HOST} (container ${NAME})"
      return 0
    fi
    sleep 0.5
  done
  echo "slapd container ${NAME} did not accept binds on ${HOST}" >&2
  exit 1
}

# osixia ships with "by * none" on normal attributes, so the service account
# can bind but cannot search dc=example,dc=com (ldapsearch returns 32).
# Debian slapd allows read. Match that, and keep password hashes auth-only.
ensure_search_acl() {
  local access
  access=$(docker exec "$NAME" ldapsearch -Q -LLL -Y EXTERNAL -H ldapi:/// \
    -b 'olcDatabase={1}mdb,cn=config' -s base olcAccess \
    | tr -d '\n' | tr -s ' ')
  if [[ "$access" == *"by * read"* ]]; then
    return 0
  fi
  docker exec -i "$NAME" ldapmodify -Q -Y EXTERNAL -H ldapi:/// <<'EOF'
dn: olcDatabase={1}mdb,cn=config
changetype: modify
replace: olcAccess
olcAccess: {0}to * by dn.exact=gidNumber=0+uidNumber=0,cn=peercred,cn=external,cn=auth manage by * break
olcAccess: {1}to attrs=userPassword,shadowLastChange by self write by dn="cn=admin,dc=example,dc=com" write by anonymous auth by * none
olcAccess: {2}to * by self read by dn="cn=admin,dc=example,dc=com" write by * read
EOF
}

if docker container inspect "$NAME" >/dev/null 2>&1; then
  if [[ "$(docker inspect -f '{{.State.Running}}' "$NAME")" == "true" ]]; then
    echo "slapd already running (container ${NAME})"
  else
    docker start "$NAME" >/dev/null
    wait_until_ready
  fi
else
  docker run -d --name "$NAME" \
    -p "${PORT}:389" \
    -e LDAP_ORGANISATION="Example" \
    -e LDAP_DOMAIN="example.com" \
    -e LDAP_ADMIN_PASSWORD="$ADMIN_PW" \
    "$IMAGE" >/dev/null
  wait_until_ready
fi

ensure_search_acl
