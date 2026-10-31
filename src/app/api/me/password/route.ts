import bcrypt from "bcryptjs";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/authz";
import { HttpError, json, route } from "@/lib/http";
import { userFromRequest } from "@/lib/session";
import { hashPassword, newPassword } from "@/lib/passwords";
import { audit } from "@/lib/audit";

const body = z.object({ current: z.string().min(1).max(200), next: newPassword });

/** 改自己的密碼（學員、講師皆可） */
export const POST = route(async (req: Request) => {
  const me = requireUser(await userFromRequest(req));
  const input = body.parse(await req.json());
  const u = await db.user.findUniqueOrThrow({ where: { id: me.id } });
  if (!u.passwordHash || !(await bcrypt.compare(input.current, u.passwordHash))) throw new HttpError(400, "目前密碼不正確");
  await db.user.update({ where: { id: me.id }, data: { passwordHash: await hashPassword(input.next) } });
  await audit(me.id, "password.change", me.id);
  return json({ ok: true });
});
