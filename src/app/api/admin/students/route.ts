import { z } from "zod";
import { db } from "@/lib/db";
import { requireInstructor } from "@/lib/authz";
import { HttpError, json, route } from "@/lib/http";
import { userFromRequest } from "@/lib/session";
import { uniqueName } from "@/lib/admin";
import { audit } from "@/lib/audit";

const body = z.object({
  name: z.string().trim().min(1).max(40),
  groupId: z.string().uuid(),
  title: z.string().trim().max(20).optional().nullable(),
});

/** 新增學員 */
export const POST = route(async (req: Request) => {
  const me = requireInstructor(await userFromRequest(req));
  const input = body.parse(await req.json());
  if (!(await db.group.findUnique({ where: { id: input.groupId } }))) throw new HttpError(400, "組別不存在");
  const last = await db.user.aggregate({ where: { groupId: input.groupId }, _max: { sortOrder: true } });
  const u = await db.user
    .create({ data: { name: input.name, role: "student", groupId: input.groupId, title: input.title || null, sortOrder: (last._max.sortOrder ?? 0) + 1 } })
    .catch(uniqueName);
  await audit(me.id, "student.create", u.id, { name: u.name });
  return json({ id: u.id }, 201);
});
