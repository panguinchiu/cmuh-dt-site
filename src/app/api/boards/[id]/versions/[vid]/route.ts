import { z } from "zod";
import { json, notFound, route } from "@/lib/http";
import { userFromRequest } from "@/lib/session";
import { boardForUser, deleteVersion, renameVersion, uuid, versionContent } from "@/lib/boards";
import { audit } from "@/lib/audit";

type Ctx = { params: Promise<{ id: string; vid: string }> };

async function load(req: Request, ctx: Ctx) {
  const p = await ctx.params;
  const r = await boardForUser(await userFromRequest(req), p.id);
  if (!uuid.safeParse(p.vid).success) throw notFound();
  return { ...r, vid: p.vid };
}

/** 版本內容（預覽、複製用） */
export const GET = route(async (req: Request, ctx: Ctx) => {
  const { board, vid } = await load(req, ctx);
  const c = await versionContent(board.id, vid);
  return json({ id: vid, name: c.name, elements: c.elements, files: c.files });
});

const patch = z.object({ name: z.string().trim().min(1).max(80) });

export const PATCH = route(async (req: Request, ctx: Ctx) => {
  const { me, board, vid } = await load(req, ctx);
  const { name } = patch.parse(await req.json());
  await renameVersion(board.id, vid, name);
  await audit(me.id, "board.version_rename", vid, { name });
  return json({ ok: true });
});

export const DELETE = route(async (req: Request, ctx: Ctx) => {
  const { me, board, vid } = await load(req, ctx);
  await deleteVersion(board.id, vid);
  await audit(me.id, "board.version_delete", vid);
  return json({ ok: true });
});
