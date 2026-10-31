import { z } from "zod";
import { db } from "@/lib/db";
import { HttpError, json, route } from "@/lib/http";
import { clientIp, isLimited, recordFail } from "@/lib/ratelimit";
import { mailConfigured, maskEmail, sendResetMail } from "@/lib/mail";
import { createResetToken, resetLink } from "@/lib/reset";
import { broadcast } from "@/lib/hub";
import { audit } from "@/lib/audit";

const body = z.object({ userId: z.string().uuid() });

/**
 * 忘記密碼：
 * - 有 email 且已設定寄信 → 寄出 30 分鐘有效的重設連結
 * - 否則 → 向講師提出申請，講師在管理頁核准後，使用者用課程通關密碼重新設定
 * 每個 IP 5 分鐘最多 5 次、同一帳號最多 3 次，避免灌信。
 */
export const POST = route(async (req: Request) => {
  const { userId } = body.parse(await req.json());
  const ip = clientIp(req);
  const kIp = `${ip}|forgot`;
  const kUser = `forgot|${userId}`;
  if (isLimited(kIp)) throw new HttpError(429, "申請太多次，請 5 分鐘後再試");
  recordFail(kIp);
  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user?.active) throw new HttpError(400, "帳號不存在或已停用");
  if (!user.passwordHash) return json({ via: "setup", message: "你還沒設定過密碼，請直接用課程通關密碼設定。" });
  for (let i = 0; i < 2; i++) if (isLimited(kUser)) throw new HttpError(429, "已經寄過了，請先收信或 5 分鐘後再試");
  recordFail(kUser);
  recordFail(kUser); // 同一帳號 5 分鐘內最多 3 次（每次計 2）

  if (user.email && mailConfigured()) {
    const token = await createResetToken(user.id);
    try {
      await sendResetMail(user.email, user.name, resetLink(token));
    } catch (e) {
      console.error("[mail] send failed", (e as Error).message);
      throw new HttpError(502, "寄信失敗，請稍後再試或找講師重設");
    }
    await audit(user.id, "forgot.email");
    return json({ via: "email", to: maskEmail(user.email) });
  }
  await db.user.update({ where: { id: user.id }, data: { resetRequestedAt: new Date() } });
  broadcast({ type: "admin:reset-request" });
  await audit(user.id, "forgot.request");
  return json({ via: "instructor", reason: user.email ? "mail_not_configured" : "no_email" });
});
