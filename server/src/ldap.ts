import { Client, EqualityFilter } from "ldapts";

export type LdapUser = {
  username: string;
  email: string;
  dn: string;
};

export type LdapConfig = {
  url: string;
  appDn: string;
  appPassword: string;
  searchBase: string;
  usernameAttribute: string;
  mailAttribute: string;
};

export function ldapConfigFromEnv(): LdapConfig {
  return {
    url: process.env.LDAP_URL ?? "ldap://127.0.0.1:389",
    appDn: process.env.LDAP_APP_DN ?? "cn=service,ou=people,dc=example,dc=com",
    appPassword: process.env.LDAP_APP_PASSWORD ?? "servicepass",
    searchBase: process.env.LDAP_SEARCH_BASE ?? "dc=example,dc=com",
    usernameAttribute: process.env.LDAP_ATTRIBUTE_FOR_USERNAME ?? "uid",
    mailAttribute: process.env.LDAP_ATTRIBUTE_FOR_MAIL ?? "mail",
  };
}

function firstString(value: unknown): string | undefined {
  if (typeof value === "string" && value.length > 0) return value;
  if (Array.isArray(value) && typeof value[0] === "string" && value[0].length > 0) return value[0];
  return undefined;
}

/** Open WebUI-style: app bind → search user → rebind with user password. */
export async function authenticateLdap(
  config: LdapConfig,
  username: string,
  password: string,
): Promise<LdapUser | null> {
  const login = username.trim();
  if (!login || !password) return null;

  const app = new Client({ url: config.url });
  try {
    await app.bind(config.appDn, config.appPassword);
    const { searchEntries } = await app.search(config.searchBase, {
      scope: "sub",
      filter: new EqualityFilter({ attribute: config.usernameAttribute, value: login }),
      attributes: [config.usernameAttribute, config.mailAttribute, "cn"],
      sizeLimit: 1,
    });
    const entry = searchEntries[0];
    if (!entry?.dn) return null;

    const user = new Client({ url: config.url });
    try {
      await user.bind(entry.dn, password);
    } catch {
      return null;
    } finally {
      await user.unbind().catch(() => {});
    }

    const resolvedUsername =
      firstString(entry[config.usernameAttribute]) ?? firstString(entry.cn) ?? login;
    const email = firstString(entry[config.mailAttribute]) ?? `${resolvedUsername}@localhost`;
    return { username: resolvedUsername, email, dn: entry.dn };
  } finally {
    await app.unbind().catch(() => {});
  }
}
