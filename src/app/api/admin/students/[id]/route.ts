import { z } from "zod";
import { db } from "@/lib/db";
import { requireInstructor } from "@/lib/authz";
import { HttpError, json, notFound, route } from "@/lib/http";
import { userFromRequest } from "@/lib/session";
import { uniqueName } from "@/lib/admin";
import { audit } from "@/lib/audit";

type Ctx = { params: Promise<{ id: string }> };
const body = z
  .object({
    name: z.string().trim().min(1).max(40).optional(),
    groupId: z.string().uuid().optional(),
    title: z.string().trim().max(20).nullable().optional(),
    active: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, "沒有要更新的欄位");

/** 改名、換組、改職稱、停用/啟用（停用時立即登出該學員） */
export const PATCH = route(async (req: Request, ctx: Ctx) => {
  const me = requireInstructor(await userFromRequest(req));
  const id = z.string().uuid().safeParse((await ctx.params).id);
  if (!id.success) throw notFound();
  const u = await db.user.findUnique({ where: { id: id.data } });
  if (!u || u.role !== "student") throw notFound();
  const input = body.parse(await req.json());
  if (input.groupId && !(await db.group.findUnique({ where: { id: input.groupId } }))) throw new HttpError(400, "組別不存在");
  await db.user
    .update({
      where: { id: u.id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.groupId !== undefined ? { groupId: input.groupId } : {}),
        ...(input.title !== undefined ? { title: input.title || null } : {}),
        ...(input.active !== undefined ? { active: input.active } : {}),
      },
    })
    .catch(uniqueName);
  // 換組或停用：既有 session 作廢，讓權限立即生效（白板 ws 也會在重驗時被踢出）
  if (input.active === false || (input.groupId && input.groupId !== u.groupId)) await db.session.deleteMany({ where: { userId: u.id } });
  await audit(me.id, "student.update", u.id, input);
  return json({ ok: true });
});
