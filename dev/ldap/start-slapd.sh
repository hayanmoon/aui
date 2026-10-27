#!/usr/bin/env bash
# Start local OpenLDAP on ldap://127.0.0.1:389.
# Debian/Ubuntu: local slapd. macOS: Docker (osixia/openldap).
set -euo pipefail

DIR=$(cd "$(dirname "$0")" && pwd)
case "$(uname -s)" in
  Darwin) exec "$DIR/start-slapd-mac.sh" ;;
  Linux)  exec "$DIR/start-slapd-debian.sh" ;;
  *)
    echo "Unsupported OS $(uname -s). Run start-slapd-debian.sh or start-slapd-mac.sh." >&2
    exit 1
    ;;
esac
