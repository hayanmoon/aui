#!/usr/bin/env bash
# Open WebUI-style LDAP auth against local OpenLDAP (slapd).
set -euo pipefail

HOST="${LDAP_HOST:-ldap://127.0.0.1:389}"
APP_DN="${LDAP_APP_DN:-cn=service,ou=people,dc=example,dc=com}"
APP_PW="${LDAP_APP_PASSWORD:-servicepass}"
BASE="${LDAP_SEARCH_BASE:-dc=example,dc=com}"
USER_ATTR="${LDAP_ATTRIBUTE_FOR_USERNAME:-uid}"
LOGIN="${1:-jdoe}"
PASSWORD="${2:-password123}"

echo "1) App bind + search for ${USER_ATTR}=${LOGIN}"
USER_DN=$(ldapsearch -x -LLL -H "$HOST" \
  -D "$APP_DN" -w "$APP_PW" \
  -b "$BASE" "(${USER_ATTR}=${LOGIN})" dn \
  | awk '/^dn:/{print substr($0,5); exit}')

if [[ -z "${USER_DN}" ]]; then
  echo "FAIL: user not found"
  exit 1
fi
echo "   found: ${USER_DN}"

echo "2) User password bind"
if OUT=$(ldapwhoami -x -H "$HOST" -D "$USER_DN" -w "$PASSWORD" 2>&1); then
  echo "   OK: ${OUT}"
  echo "PASS: ${LOGIN} authenticated via LDAP"
else
  echo "FAIL: ${OUT}"
  exit 1
fi
