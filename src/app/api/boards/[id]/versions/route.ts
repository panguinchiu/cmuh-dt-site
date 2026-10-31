import { z } from "zod";
import { json, route } from "@/lib/http";
import { userFromRequest } from "@/lib/session";
import { boardForUser, clock, createVersion, ensureSegmentPages, listVersions } from "@/lib/boards";
import { listAgenda } from "@/lib/agenda";
import { audit } from "@/lib/audit";

type Ctx = { params: Promise<{ id: string }> };

/** 版本清單（依排序；第一個＝白板畫面上的版本） */
export const GET = route(async (req: Request, ctx: Ctx) => {
  const { board } = await boardForUser(await userFromRequest(req), (await ctx.params).id);
  await ensureSegmentPages(board.id);
  return json({ versions: await listVersions(board.id) });
});

const body = z.object({ name: z.string().trim().max(80).optional() });

/** 存成版本：把畫面內容複製成新版本；預設名稱＝目前段落＋時刻 */
export const POST = route(async (req: Request, ctx: Ctx) => {
  const { me, board } = await boardForUser(await userFromRequest(req), (await ctx.params).id);
  await ensureSegmentPages(board.id);
  const input = body.parse(await req.json().catch(() => ({})));
  let name = input.name;
  if (!name) {
    const a = await listAgenda();
    const cur = a.items.find((i) => i.id === a.currentId);
    name = `${cur ? cur.title : "版本"} · ${clock()}`;
  }
  const v = await createVersion(board.id, name, me.id);
  await audit(me.id, "board.version", board.id, { versionId: v.id });
  return json({ id: v.id, name: v.name, createdAt: v.createdAt }, 201);
});
