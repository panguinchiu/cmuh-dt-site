import bcrypt from "bcryptjs";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireInstructor } from "@/lib/authz";
import { json, notFound, route } from "@/lib/http";
import { userFromRequest } from "@/lib/session";
import { newPassword } from "@/lib/admin";
import { audit } from "@/lib/audit";

type Ctx = { params: Promise<{ id: string }> };
const body = z.object({ password: z.string().min(8).max(200).optional() });

/** 重設其他講師的密碼（未指定則隨機產生）；新密碼只回傳一次，並登出該講師 */
export const POST = route(async (req: Request, ctx: Ctx) => {
  const me = requireInstructor(await userFromRequest(req));
  const id = z.string().uuid().safeParse((await ctx.params).id);
  if (!id.success) throw notFound();
  const u = await db.user.findUnique({ where: { id: id.data } });
  if (!u || u.role !== "instructor") throw notFound();
  const input = body.parse(await req.json().catch(() => ({})));
  const password = input.password ?? newPassword();
  await db.user.update({ where: { id: u.id }, data: { passwordHash: await bcrypt.hash(password, 10) } });
  if (u.id !== me.id) await db.session.deleteMany({ where: { userId: u.id } });
  await audit(me.id, "instructor.password_reset", u.id);
  return json({ password: input.password ? null : password });
});
