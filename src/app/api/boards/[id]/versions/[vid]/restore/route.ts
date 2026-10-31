import { json, notFound, route } from "@/lib/http";
import { userFromRequest } from "@/lib/session";
import { boardForUser, restoreVersion, uuid } from "@/lib/boards";
import { audit } from "@/lib/audit";

type Ctx = { params: Promise<{ id: string; vid: string }> };

/** 還原版本（還原前自動再存一版目前狀態） */
export const POST = route(async (req: Request, ctx: Ctx) => {
  const p = await ctx.params;
  const { me, board } = await boardForUser(await userFromRequest(req), p.id);
  if (!uuid.safeParse(p.vid).success) throw notFound();
  const v = await restoreVersion(board.id, p.vid, me.id);
  await audit(me.id, "board.restore", board.id, { versionId: v.id });
  return json({ ok: true });
});
