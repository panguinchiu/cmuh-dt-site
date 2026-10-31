import { requireUser } from "@/lib/authz";
import { json, route } from "@/lib/http";
import { userFromRequest } from "@/lib/session";
import { getGame, myMatch } from "@/lib/game-server";

type Ctx = { params: Promise<{ slug: string }> };

/** 學員自己的對局（只含己方視角，不含帶領者內容） */
export const GET = route(async (req: Request, ctx: Ctx) => {
  const me = requireUser(await userFromRequest(req));
  const game = await getGame((await ctx.params).slug);
  return json({ game: { slug: game.slug, title: game.title, published: game.published }, match: await myMatch(me, game.id) });
});
