import { z } from "zod";
import { db } from "@/lib/db";
import { requireInstructor } from "@/lib/authz";
import { HttpError, json, notFound, route } from "@/lib/http";
import { userFromRequest } from "@/lib/session";
import { getGame, notifyGame } from "@/lib/game-server";
import { audit } from "@/lib/audit";

type Ctx = { params: Promise<{ slug: string; id: string }> };
const body = z.object({ confirm: z.literal("RESET") });

/** 重置對局（講師，需二次確認：body 必須帶 confirm: "RESET"） */
export const POST = route(async (req: Request, ctx: Ctx) => {
  const me = requireInstructor(await userFromRequest(req));
  const p = await ctx.params;
  const game = await getGame(p.slug);
  if (!body.safeParse(await req.json().catch(() => ({}))).success) throw new HttpError(400, "需要二次確認");
  if (!z.string().uuid().safeParse(p.id).success) throw notFound();
  const m = await db.gameMatch.findFirst({ where: { id: p.id, gameId: game.id } });
  if (!m) throw notFound();
  await db.gameRound.updateMany({ where: { matchId: m.id }, data: { medChoice: null, surgChoice: null, updatedById: me.id } });
  await audit(me.id, "game.reset", m.id, { label: m.label });
  notifyGame(game.slug);
  return json({ ok: true });
});
