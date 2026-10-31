import { z } from "zod";
import { json, notFound, route } from "@/lib/http";
import { userFromRequest } from "@/lib/session";
import { boardForUser, copyVersion, uuid } from "@/lib/boards";
import { audit } from "@/lib/audit";

type Ctx = { params: Promise<{ id: string; vid: string }> };
const body = z.object({ targetId: z.string().uuid(), mode: z.enum(["append", "replace"]) });

/** 把這個版本的內容複製到同一塊白板的另一個版本 */
export const POST = route(async (req: Request, ctx: Ctx) => {
  const p = await ctx.params;
  const { me, board } = await boardForUser(await userFromRequest(req), p.id);
  if (!uuid.safeParse(p.vid).success) throw notFound();
  const { targetId, mode } = body.parse(await req.json());
  await copyVersion(board.id, p.vid, targetId, mode, me.id);
  await audit(me.id, "board.version_copy", board.id, { from: p.vid, to: targetId, mode });
  return json({ ok: true });
});
