#!/usr/bin/env bash
# Debian/Ubuntu: start the distro slapd on 127.0.0.1:389.
# Expects slapd from `apt-get install slapd`, domain dc=example,dc=com,
# admin cn=admin,dc=example,dc=com / adminpass.
set -euo pipefail

LISTEN="${LDAP_LISTEN:-ldap://127.0.0.1:389/}"
CONF="${LDAP_CONF_DIR:-/etc/ldap/slapd.d}"

if pgrep -x slapd >/dev/null; then
  echo "slapd already running (pid $(pgrep -x slapd))"
  exit 0
fi

sudo mkdir -p /var/run/slapd
sudo chown openldap:openldap /var/run/slapd
sudo slapd -h "$LISTEN" -F "$CONF"
sleep 0.3
echo "slapd listening on ${LISTEN} (pid $(pgrep -x slapd))"
