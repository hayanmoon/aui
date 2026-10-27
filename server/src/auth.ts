import { createHmac, timingSafeEqual } from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { LdapUser } from "./ldap.js";

const COOKIE = "auth";
const MAX_AGE_SEC = 60 * 60 * 12;

export type AuthUser = {
  username: string;
  email: string;
};

type CookiePayload = AuthUser & { exp: number };

function authSecret(): string {
  return process.env.AUTH_SECRET ?? "dev-auth-secret-change-me";
}

function sign(payload: string): string {
  return createHmac("sha256", authSecret()).update(payload).digest("base64url");
}

export function setAuthCookie(reply: FastifyReply, user: LdapUser | AuthUser): void {
  const body: CookiePayload = {
    username: user.username,
    email: user.email,
    exp: Math.floor(Date.now() / 1000) + MAX_AGE_SEC,
  };
  const payload = Buffer.from(JSON.stringify(body), "utf8").toString("base64url");
  const token = `${payload}.${sign(payload)}`;
  reply.setCookie(COOKIE, token, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.COOKIE_SECURE === "1",
    maxAge: MAX_AGE_SEC,
  });
}

export function clearAuthCookie(reply: FastifyReply): void {
  reply.clearCookie(COOKIE, { path: "/" });
}

export function readAuthUser(request: FastifyRequest): AuthUser | null {
  const token = request.cookies?.[COOKIE];
  if (!token) return null;
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;
  const expected = sign(payload);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as CookiePayload;
    if (typeof data.username !== "string" || typeof data.email !== "string") return null;
    if (typeof data.exp !== "number" || data.exp < Math.floor(Date.now() / 1000)) return null;
    return { username: data.username, email: data.email };
  } catch {
    return null;
  }
}

export async function requireAuth(request: FastifyRequest, reply: FastifyReply): Promise<AuthUser | null> {
  const user = readAuthUser(request);
  if (!user) {
    await reply.code(401).send({ error: "Authentication required" });
    return null;
  }
  return user;
}
