import { z } from "zod";
import { db } from "@/lib/db";
import { assert, canSubmitGameRound, isInstructor, requireUser } from "@/lib/authz";
import { HttpError, json, notFound, route } from "@/lib/http";
import { userFromRequest } from "@/lib/session";
import { getGame, notifyGame } from "@/lib/game-server";
import { ROUNDS } from "@/lib/game";

type Ctx = { params: Promise<{ slug: string; id: string; n: string }> };
const body = z.object({ side: z.enum(["med", "surg"]), choice: z.enum(["FULL", "HOLD", "SELF"]).nullable() });

/** 寫入回合選擇：學員只能寫自己組的席位；講師可代填/更正 */
export const PUT = route(async (req: Request, ctx: Ctx) => {
  const me = requireUser(await userFromRequest(req));
  const p = await ctx.params;
  const game = await getGame(p.slug);
  const n = z.coerce.number().int().min(1).max(ROUNDS).parse(p.n);
  const input = body.parse(await req.json());
  if (!z.string().uuid().safeParse(p.id).success) throw notFound();
  const m = await db.gameMatch.findFirst({ where: { id: p.id, gameId: game.id } });
  if (!m) throw notFound();
  assert(canSubmitGameRound(me, m, input.side));

  const field = input.side === "med" ? "medChoice" : "surgChoice";
  const cur = await db.gameRound.findUnique({ where: { matchId_round: { matchId: m.id, round: n } } });
  // 同時亮牌：雙方都出牌（已揭曉）後，學員不能再改；講師可更正
  if (!isInstructor(me) && cur?.medChoice && cur?.surgChoice) throw new HttpError(409, "本回合已亮牌，如需更正請找講師");

  await db.gameRound.upsert({
    where: { matchId_round: { matchId: m.id, round: n } },
    update: { [field]: input.choice, updatedById: me.id },
    create: { matchId: m.id, round: n, [field]: input.choice, updatedById: me.id },
  });
  notifyGame(game.slug);
  return json({ ok: true });
});
