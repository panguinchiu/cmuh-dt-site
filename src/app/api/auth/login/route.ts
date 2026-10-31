import bcrypt from "bcryptjs";
import { z } from "zod";
import { db } from "@/lib/db";
import { HttpError, json, route } from "@/lib/http";
import { clearFails, clientIp, isLimited, recordFail } from "@/lib/ratelimit";
import { createSession, sessionCookie } from "@/lib/session";
import { audit } from "@/lib/audit";

const body = z.object({ userId: z.string().uuid(), password: z.string().min(1).max(200) });

/** 以個人密碼登入；尚未設定密碼的人回 409，前端改走第一次登入（通關密碼＋自設密碼） */
export const POST = route(async (req: Request) => {
  const input = body.parse(await req.json());
  const key = `${clientIp(req)}|${input.userId}`;
  if (isLimited(key)) throw new HttpError(429, "嘗試太多次，請 5 分鐘後再試");

  const user = await db.user.findUnique({ where: { id: input.userId } });
  if (user?.active && !user.passwordHash) return json({ error: "第一次登入，請先設定密碼", needsSetup: true }, 409);
  const ok = !!user?.active && !!user.passwordHash && (await bcrypt.compare(input.password, user.passwordHash));
  if (!ok || !user) {
    recordFail(key);
    await audit(user?.id ?? null, "login.fail");
    throw new HttpError(401, "密碼不正確");
  }
  clearFails(key);
  const s = await createSession(user.id);
  await audit(user.id, "login.ok");
  return json({ ok: true }, 200, { "Set-Cookie": sessionCookie(s.token, s.expiresAt) });
});
