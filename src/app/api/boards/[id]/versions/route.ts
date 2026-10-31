import { z } from "zod";
import { db } from "@/lib/db";
import { json, route } from "@/lib/http";
import { userFromRequest } from "@/lib/session";
import { boardForUser, clock, createVersion } from "@/lib/boards";
import { listAgenda } from "@/lib/agenda";
import { audit } from "@/lib/audit";

type Ctx = { params: Promise<{ id: string }> };

export const GET = route(async (req: Request, ctx: Ctx) => {
  const { board } = await boardForUser(await userFromRequest(req), (await ctx.params).id);
  const rows = await db.boardVersion.findMany({
    where: { boardId: board.id },
    orderBy: { createdAt: "desc" },
    select: { id: true, name: true, createdAt: true, createdById: true },
    take: 200,
  });
  const users = await db.user.findMany({ where: { id: { in: rows.map((r) => r.createdById!).filter(Boolean) } }, select: { id: true, name: true } });
  const nameOf = new Map(users.map((u) => [u.id, u.name]));
  return json({ versions: rows.map((r) => ({ id: r.id, name: r.name, createdAt: r.createdAt, createdBy: nameOf.get(r.createdById ?? "") ?? null })) });
});

const body = z.object({ name: z.string().trim().max(80).optional() });

/** 存成版本；預設名稱＝目前段落名稱＋存檔時刻 */
export const POST = route(async (req: Request, ctx: Ctx) => {
  const { me, board } = await boardForUser(await userFromRequest(req), (await ctx.params).id);
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
