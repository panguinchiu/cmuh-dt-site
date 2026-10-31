import bcrypt from "bcryptjs";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireInstructor } from "@/lib/authz";
import { json, notFound, route } from "@/lib/http";
import { userFromRequest } from "@/lib/session";
import { newGroupCode } from "@/lib/admin";
import { audit } from "@/lib/audit";

type Ctx = { params: Promise<{ id: string }> };

/** 重設組別代碼：新代碼只在這次回應中出現一次（DB 只存 hash） */
export const POST = route(async (req: Request, ctx: Ctx) => {
  const me = requireInstructor(await userFromRequest(req));
  const id = z.string().uuid().safeParse((await ctx.params).id);
  if (!id.success) throw notFound();
  const g = await db.group.findUnique({ where: { id: id.data } });
  if (!g) throw notFound();
  const code = newGroupCode();
  await db.group.update({ where: { id: g.id }, data: { codeHash: await bcrypt.hash(code, 10) } });
  await audit(me.id, "group.code_reset", g.id);
  return json({ code });
});
