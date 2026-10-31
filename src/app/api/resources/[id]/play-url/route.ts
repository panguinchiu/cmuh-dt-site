import { requireUser } from "@/lib/authz";
import { json, notFound, route } from "@/lib/http";
import { userFromRequest } from "@/lib/session";
import { getVisibleResource } from "@/lib/resources";
import { playUrl } from "@/lib/play-token";

type Ctx = { params: Promise<{ id: string }> };

/** 取得 HTML 遊戲的短效簽章網址（不可見 → 404） */
export const GET = route(async (req: Request, ctx: Ctx) => {
  const me = requireUser(await userFromRequest(req));
  const id = (await ctx.params).id;
  const r = /^[0-9a-f-]{36}$/i.test(id) ? await getVisibleResource(me, id) : null;
  if (!r || r.type !== "html_game") throw notFound();
  return json({ url: playUrl(r.id, me.id) });
});
