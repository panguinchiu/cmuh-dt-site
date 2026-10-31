import { z } from "zod";
import { db } from "@/lib/db";
import { requireInstructor } from "@/lib/authz";
import { json, route } from "@/lib/http";
import { userFromRequest } from "@/lib/session";
import { getGame, notifyPublish } from "@/lib/game-server";
import { audit } from "@/lib/audit";

type Ctx = { params: Promise<{ slug: string }> };
const body = z.object({ published: z.boolean() });

/** 「公開給學員」開關 */
export const POST = route(async (req: Request, ctx: Ctx) => {
  const me = requireInstructor(await userFromRequest(req));
  const game = await getGame((await ctx.params).slug);
  const { published } = body.parse(await req.json());
  await db.game.update({ where: { id: game.id }, data: { published } });
  await audit(me.id, "game.publish", game.slug, { published });
  notifyPublish(game.slug, published);
  return json({ published });
});
