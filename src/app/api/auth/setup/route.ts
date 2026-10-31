import { z } from "zod";
import { db } from "@/lib/db";
import { HttpError, json, route } from "@/lib/http";
import { clearFails, clientIp, isLimited, recordFail } from "@/lib/ratelimit";
import { createSession, sessionCookie } from "@/lib/session";
import { checkCoursePass, emailSchema, hashPassword, newPassword } from "@/lib/passwords";
import { audit } from "@/lib/audit";

const body = z.object({ userId: z.string().uuid(), passphrase: z.string().min(1).max(100), password: newPassword, email: emailSchema });

/**
 * 第一次登入：輸入設計思考課程通關密碼，自行設定個人密碼，並留下 email（忘記密碼時寄重設連結）。
 * 只能用在尚未設定密碼的帳號（已設定者需由講師在管理頁重設）。
 * 通關密碼錯誤依「IP＋帳號」與「IP」雙重限流，避免猜通關密碼。
 */
export const POST = route(async (req: Request) => {
  const input = body.parse(await req.json());
  const ip = clientIp(req);
  const keyUser = `${ip}|setup|${input.userId}`;
  const keyIp = `${ip}|setup`;
  if (isLimited(keyUser) || isLimited(keyIp)) throw new HttpError(429, "嘗試太多次，請 5 分鐘後再試");

  const user = await db.user.findUnique({ where: { id: input.userId } });
  if (!user?.active) throw new HttpError(400, "帳號不存在或已停用");
  if (user.passwordHash) throw new HttpError(409, "這個帳號已設定過密碼，請直接登入；忘記密碼請找講師重設");
  if (!(await checkCoursePass(input.passphrase))) {
    recordFail(keyUser);
    recordFail(keyIp);
    await audit(user.id, "setup.fail");
    throw new HttpError(401, "課程通關密碼不正確");
  }
  // 條件更新：避免兩個人同時搶設同一個帳號
  const r = await db.user.updateMany({ where: { id: user.id, passwordHash: null }, data: { passwordHash: await hashPassword(input.password), email: input.email, resetRequestedAt: null } });
  if (!r.count) throw new HttpError(409, "這個帳號已設定過密碼，請直接登入");
  clearFails(keyUser);
  const s = await createSession(user.id);
  await audit(user.id, "setup.ok");
  return json({ ok: true }, 200, { "Set-Cookie": sessionCookie(s.token, s.expiresAt) });
});
