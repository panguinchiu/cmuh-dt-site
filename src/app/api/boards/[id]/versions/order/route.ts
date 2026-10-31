import { z } from "zod";
import { json, route } from "@/lib/http";
import { userFromRequest } from "@/lib/session";
import { boardForUser, listVersions, reorderVersions } from "@/lib/boards";
import { audit } from "@/lib/audit";

type Ctx = { params: Promise<{ id: string }> };
const body = z.object({ ids: z.array(z.string().uuid()).min(1).max(500) });

/** 拖移排序；排第一的版本會顯示在白板畫面上 */
export const PUT = route(async (req: Request, ctx: Ctx) => {
  const { me, board } = await boardForUser(await userFromRequest(req), (await ctx.params).id);
  const { ids } = body.parse(await req.json());
  await reorderVersions(board.id, ids, me.id);
  await audit(me.id, "board.reorder", board.id, { top: ids[0] });
  return json({ versions: await listVersions(board.id) });
});
