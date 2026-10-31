import { z } from "zod";
import { db } from "@/lib/db";
import { requireInstructor } from "@/lib/authz";
import { HttpError, json, notFound, route } from "@/lib/http";
import { userFromRequest } from "@/lib/session";
import { getGame, notifyGame } from "@/lib/game-server";
import { audit } from "@/lib/audit";

type Ctx = { params: Promise<{ slug: string; id: string }> };
const body = z.object({
  label: z.string().trim().min(1).max(40).optional(),
  medGroupId: z.string().uuid().nullable(),
  surgGroupId: z.string().uuid().nullable(),
});

/** 設定對局配對（講師） */
export const PUT = route(async (req: Request, ctx: Ctx) => {
  const me = requireInstructor(await userFromRequest(req));
  const p = await ctx.params;
  const game = await getGame(p.slug);
  const input = body.parse(await req.json());
  if (!z.string().uuid().safeParse(p.id).success) throw notFound();
  const m = await db.gameMatch.findFirst({ where: { id: p.id, gameId: game.id } });
  if (!m) throw notFound();
  if (input.medGroupId && input.medGroupId === input.surgGroupId) throw new HttpError(400, "內科隊與外科隊不能是同一組");
  // 一組只能出現在一場對局，避免學員頁不知道帶哪一場
  const others = await db.gameMatch.findMany({ where: { gameId: game.id, NOT: { id: m.id } } });
  const used = new Set(others.flatMap((o) => [o.medGroupId, o.surgGroupId]).filter(Boolean));
  if ((input.medGroupId && used.has(input.medGroupId)) || (input.surgGroupId && used.has(input.surgGroupId))) {
    throw new HttpError(400, "這一組已在另一場對局中，請先調整另一場");
  }
  await db.gameMatch.update({
    where: { id: m.id },
    data: { label: input.label ?? m.label, medGroupId: input.medGroupId, surgGroupId: input.surgGroupId },
  });
  await audit(me.id, "game.pairing", m.id, input);
  notifyGame(game.slug);
  return json({ ok: true });
});
