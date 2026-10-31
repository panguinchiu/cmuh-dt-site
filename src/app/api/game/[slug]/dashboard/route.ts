import { assert, canViewGameDashboard, requireUser } from "@/lib/authz";
import { json, route } from "@/lib/http";
import { userFromRequest } from "@/lib/session";
import { dashboard, getGame } from "@/lib/game-server";

type Ctx = { params: Promise<{ slug: string }> };

/** 所有對局＋揭盅總帳＋debrief：講師；學員僅在公開後（唯讀） */
export const GET = route(async (req: Request, ctx: Ctx) => {
  const me = requireUser(await userFromRequest(req));
  const game = await getGame((await ctx.params).slug);
  assert(canViewGameDashboard(me, game));
  return json({ game: { slug: game.slug, title: game.title }, ...(await dashboard(game.id, game.published)) });
});
