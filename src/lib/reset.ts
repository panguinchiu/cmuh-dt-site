import { createHmac, randomBytes } from "node:crypto";
import { db } from "./db";
import { env } from "./env";

export const RESET_TTL_MS = 30 * 60 * 1000;
const hashToken = (t: string) => createHmac("sha256", env.sessionSecret).update(`reset:${t}`).digest("hex");

/** 產生一次性重設 token（DB 只存 hash，30 分鐘有效；同一人只保留最新一組） */
export async function createResetToken(userId: string) {
  const token = randomBytes(32).toString("base64url");
  await db.user.update({ where: { id: userId }, data: { resetTokenHash: hashToken(token), resetTokenExpiresAt: new Date(Date.now() + RESET_TTL_MS) } });
  return token;
}

export async function findByResetToken(token: string) {
  if (!/^[A-Za-z0-9_-]{20,100}$/.test(token)) return null;
  const u = await db.user.findFirst({ where: { resetTokenHash: hashToken(token), active: true } });
  if (!u || !u.resetTokenExpiresAt || u.resetTokenExpiresAt.getTime() < Date.now()) return null;
  return u;
}

export const resetLink = (token: string) => `${env.appOrigin}/reset?token=${encodeURIComponent(token)}`;
