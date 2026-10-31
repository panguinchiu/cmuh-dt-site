import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/authz";
import { json, route } from "@/lib/http";
import { userFromRequest } from "@/lib/session";
import { emailSchema } from "@/lib/passwords";

const body = z.object({ email: emailSchema });

/** 修改自己的 email（忘記密碼信的收件地址） */
export const PATCH = route(async (req: Request) => {
  const me = requireUser(await userFromRequest(req));
  const { email } = body.parse(await req.json());
  await db.user.update({ where: { id: me.id }, data: { email } });
  return json({ ok: true });
});
