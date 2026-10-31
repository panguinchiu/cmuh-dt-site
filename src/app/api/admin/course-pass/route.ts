import { z } from "zod";
import { requireInstructor } from "@/lib/authz";
import { json, route } from "@/lib/http";
import { userFromRequest } from "@/lib/session";
import { coursePass, setCoursePass } from "@/lib/passwords";
import { audit } from "@/lib/audit";

const body = z.object({ passphrase: coursePass });

/** 設定設計思考課程通關密碼（只存 hash；已設定好個人密碼的人不受影響） */
export const PUT = route(async (req: Request) => {
  const me = requireInstructor(await userFromRequest(req));
  const { passphrase } = body.parse(await req.json());
  await setCoursePass(passphrase);
  await audit(me.id, "course_pass.set");
  return json({ ok: true });
});
