import { z } from "zod";
import { db } from "@/lib/db";
import { HttpError, json, route } from "@/lib/http";
import { clientIp, isLimited, recordFail } from "@/lib/ratelimit";
import { createSession, sessionCookie } from "@/lib/session";
import { hashPassword, newPassword } from "@/lib/passwords";
import { findByResetToken } from "@/lib/reset";
import { audit } from "@/lib/audit";

const body = z.object({ token: z.string().min(1).max(200), password: newPassword });

/** 用信中連結設定新密碼：token 一次性，成功後其他裝置的登入全部登出 */
export const POST = route(async (req: Request) => {
  const input = body.parse(await req.json());
  const key = `${clientIp(req)}|reset`;
  if (isLimited(key)) throw new HttpError(429, "嘗試太多次，請 5 分鐘後再試");
  const u = await findByResetToken(input.token);
  if (!u) {
    recordFail(key);
    throw new HttpError(400, "連結無效或已過期，請重新申請忘記密碼");
  }
  await db.user.update({
    where: { id: u.id },
    data: { passwordHash: await hashPassword(input.password), resetTokenHash: null, resetTokenExpiresAt: null, resetRequestedAt: null },
  });
  await db.session.deleteMany({ where: { userId: u.id } });
  const s = await createSession(u.id);
  await audit(u.id, "reset.ok");
  return json({ ok: true }, 200, { "Set-Cookie": sessionCookie(s.token, s.expiresAt) });
});
