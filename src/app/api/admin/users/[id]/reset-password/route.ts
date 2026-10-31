import { z } from "zod";
import { db } from "@/lib/db";
import { requireInstructor } from "@/lib/authz";
import { json, notFound, route } from "@/lib/http";
import { userFromRequest } from "@/lib/session";
import { audit } from "@/lib/audit";

type Ctx = { params: Promise<{ id: string }> };

/** 重設密碼（學員或其他講師）：清空密碼並登出，對方下次用課程通關密碼重新設定 */
export const POST = route(async (req: Request, ctx: Ctx) => {
  const me = requireInstructor(await userFromRequest(req));
  const id = z.string().uuid().safeParse((await ctx.params).id);
  if (!id.success) throw notFound();
  const u = await db.user.findUnique({ where: { id: id.data } });
  if (!u) throw notFound();
  await db.user.update({ where: { id: u.id }, data: { passwordHash: null, resetRequestedAt: null, resetTokenHash: null, resetTokenExpiresAt: null } });
  await db.session.deleteMany({ where: { userId: u.id } });
  await audit(me.id, "password.reset", u.id);
  return json({ ok: true });
});
