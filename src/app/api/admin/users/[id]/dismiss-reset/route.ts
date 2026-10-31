import { z } from "zod";
import { db } from "@/lib/db";
import { requireInstructor } from "@/lib/authz";
import { json, notFound, route } from "@/lib/http";
import { userFromRequest } from "@/lib/session";
import { audit } from "@/lib/audit";

type Ctx = { params: Promise<{ id: string }> };

/** 忽略忘記密碼申請 */
export const POST = route(async (req: Request, ctx: Ctx) => {
  const me = requireInstructor(await userFromRequest(req));
  const id = z.string().uuid().safeParse((await ctx.params).id);
  if (!id.success) throw notFound();
  const r = await db.user.updateMany({ where: { id: id.data }, data: { resetRequestedAt: null } });
  if (!r.count) throw notFound();
  await audit(me.id, "forgot.dismiss", id.data);
  return json({ ok: true });
});
