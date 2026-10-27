# Local OpenLDAP (slapd)

Directory on this machine for auth experiments (this app or Open WebUI).

`./start-slapd.sh` picks the setup from the OS:

| OS | Script | How it runs |
|----|--------|-------------|
| Debian/Ubuntu | `start-slapd-debian.sh` | local `slapd` |
| macOS | `start-slapd-mac.sh` | Docker container `dev-ldap` |

Both listen on `ldap://127.0.0.1:389` with the same base DN and admin account. `seed.sh` and `smoke-auth.sh` are the same on either OS (they use `ldapadd` / `ldapsearch` / `ldapwhoami`).

## Debian / Ubuntu

```bash
sudo apt-get install -y slapd ldap-utils
# Domain/org set at install time: dc=example,dc=com
# Directory admin: cn=admin,dc=example,dc=com / adminpass
```

In the Cloud Agent VM, `slapd` is already installed and seeded. Start it with `./start-slapd.sh` (or `./start-slapd-debian.sh`).

## macOS

Install [Docker Desktop](https://www.docker.com/products/docker-desktop/). `./start-slapd.sh` (or `./start-slapd-mac.sh`) runs `osixia/openldap` as container `dev-ldap`, with `LDAP_DOMAIN=example.com` and `LDAP_ADMIN_PASSWORD=adminpass`. The image’s default ACL hides the tree from the service account (`No such object (32)` on search). The start script opens read access on non-password attributes so searches match Debian slapd.

`ldapadd`, `ldapsearch`, and `ldapwhoami` ship with macOS.

Stop the directory with `docker stop dev-ldap`.

## Start

```bash
cd dev/ldap
./start-slapd.sh          # ldap://127.0.0.1:389
./seed.sh                 # once (people/groups + users)
```

## Accounts

| Login | Password | DN |
|-------|----------|----|
| Directory admin | `adminpass` | `cn=admin,dc=example,dc=com` |
| `service` | `servicepass` | `cn=service,ou=people,dc=example,dc=com` |
| `jdoe` | `password123` | `cn=jdoe,ou=people,dc=example,dc=com` |
| `appadmin` | `adminpass` | `cn=appadmin,ou=people,dc=example,dc=com` |

- Base DN: `dc=example,dc=com`
- Username attribute: `uid`
- Mail attribute: `mail`

## Smoke test

```bash
./smoke-auth.sh jdoe password123   # PASS
./smoke-auth.sh jdoe wrongpass     # FAIL
./smoke-auth.sh nobody password123 # FAIL
```

Flow: service bind → search by `uid` → rebind as user DN with password.

## Open WebUI-shaped env

```env
ENABLE_LDAP="true"
LDAP_SERVER_HOST="127.0.0.1"
LDAP_SERVER_PORT="389"
LDAP_USE_TLS="false"
LDAP_APP_DN="cn=service,ou=people,dc=example,dc=com"
LDAP_APP_PASSWORD="servicepass"
LDAP_SEARCH_BASE="dc=example,dc=com"
LDAP_ATTRIBUTE_FOR_USERNAME="uid"
LDAP_ATTRIBUTE_FOR_MAIL="mail"
```
