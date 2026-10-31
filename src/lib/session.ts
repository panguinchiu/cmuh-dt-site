import { createHmac, randomBytes } from "node:crypto";
import { db } from "./db";
import { env } from "./env";
import type { SessionUser } from "./authz";

export const SESSION_COOKIE = "dt_session";
export const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

const sessionId = (token: string) => createHmac("sha256", env.sessionSecret).update(token).digest("hex");

export async function createSession(userId: string) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await db.session.create({ data: { id: sessionId(token), userId, expiresAt } });
  return { token, expiresAt };
}

export async function destroySession(token: string | undefined) {
  if (!token) return;
  await db.session.deleteMany({ where: { id: sessionId(token) } });
}

export async function userFromToken(token: string | undefined | null): Promise<SessionUser | null> {
  if (!token) return null;
  const s = await db.session.findUnique({ where: { id: sessionId(token) }, include: { user: true } });
  if (!s) return null;
  if (s.expiresAt.getTime() < Date.now() || !s.user.active) {
    if (s.expiresAt.getTime() < Date.now()) await db.session.delete({ where: { id: s.id } }).catch(() => {});
    return null;
  }
  const u = s.user;
  return { id: u.id, name: u.name, role: u.role, groupId: u.groupId, title: u.title };
}

export function parseCookie(header: string | null | undefined, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const i = part.indexOf("=");
    if (i < 0) continue;
    if (part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return undefined;
}

/** route handler 用：從 Request 的 cookie 取使用者 */
export function userFromRequest(req: Request) {
  return userFromToken(parseCookie(req.headers.get("cookie"), SESSION_COOKIE));
}

export function sessionCookie(token: string, expiresAt: Date) {
  const parts = [`${SESSION_COOKIE}=${token}`, "Path=/", "HttpOnly", "SameSite=Lax", `Expires=${expiresAt.toUTCString()}`];
  if (env.secureCookies) parts.push("Secure");
  return parts.join("; ");
}

export function clearSessionCookie() {
  const parts = [`${SESSION_COOKIE}=`, "Path=/", "HttpOnly", "SameSite=Lax", "Max-Age=0"];
  if (env.secureCookies) parts.push("Secure");
  return parts.join("; ");
}
