import bcrypt from "bcryptjs";
import { z } from "zod";
import { db } from "@/lib/db";
import { HttpError, json, route } from "@/lib/http";
import { clearFails, clientIp, isLimited, recordFail } from "@/lib/ratelimit";
import { createSession, sessionCookie } from "@/lib/session";
import { audit } from "@/lib/audit";

const body = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("student"), userId: z.string().uuid(), code: z.string().regex(/^\d{4}$/) }),
  z.object({ kind: z.literal("instructor"), userId: z.string().uuid(), password: z.string().min(1).max(200) }),
]);

export const POST = route(async (req: Request) => {
  const input = body.parse(await req.json());
  const key = `${clientIp(req)}|${input.userId}`;
  if (isLimited(key)) throw new HttpError(429, "嘗試太多次，請 5 分鐘後再試");

  const user = await db.user.findUnique({ where: { id: input.userId }, include: { group: true } });
  let ok = false;
  if (user && user.active && user.role === input.kind) {
    if (input.kind === "student" && user.group) ok = await bcrypt.compare(input.code, user.group.codeHash);
    if (input.kind === "instructor" && user.passwordHash) ok = await bcrypt.compare(input.password, user.passwordHash);
  }
  if (!ok || !user) {
    recordFail(key);
    await audit(user?.id ?? null, "login.fail", input.kind);
    throw new HttpError(401, input.kind === "student" ? "組別代碼不正確" : "密碼不正確");
  }
  clearFails(key);
  const s = await createSession(user.id);
  await audit(user.id, "login.ok", input.kind);
  return json({ ok: true }, 200, { "Set-Cookie": sessionCookie(s.token, s.expiresAt) });
});
