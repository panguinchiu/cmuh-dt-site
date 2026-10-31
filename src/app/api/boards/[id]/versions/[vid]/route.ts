import { db } from "@/lib/db";
import { json, notFound, route } from "@/lib/http";
import { userFromRequest } from "@/lib/session";
import { boardForUser, uuid } from "@/lib/boards";

type Ctx = { params: Promise<{ id: string; vid: string }> };

/** 版本預覽 */
export const GET = route(async (req: Request, ctx: Ctx) => {
  const p = await ctx.params;
  const { board } = await boardForUser(await userFromRequest(req), p.id);
  if (!uuid.safeParse(p.vid).success) throw notFound();
  const v = await db.boardVersion.findFirst({ where: { id: p.vid, boardId: board.id } });
  if (!v) throw notFound();
  return json({ id: v.id, name: v.name, createdAt: v.createdAt, elements: v.scene, files: v.files });
});
