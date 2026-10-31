import { requireUser } from "@/lib/authz";
import { notFound, route } from "@/lib/http";
import { userFromRequest } from "@/lib/session";
import { getVisibleResource } from "@/lib/resources";
import { sasUrl } from "@/lib/blob";
import { audit } from "@/lib/audit";

type Ctx = { params: Promise<{ id: string }> };

/** 驗權後 302 到 5 分鐘 SAS；不可見與不存在一律 404（不洩漏存在） */
export const GET = route(async (req: Request, ctx: Ctx) => {
  const me = requireUser(await userFromRequest(req));
  const id = (await ctx.params).id;
  const r = /^[0-9a-f-]{36}$/i.test(id) ? await getVisibleResource(me, id) : null;
  if (!r || r.type !== "file" || !r.blobKey) throw notFound();
  const { url } = await sasUrl(r.blobKey, r.fileName ?? "download");
  await audit(me.id, "resource.download", r.id);
  return new Response(null, { status: 302, headers: { Location: url, "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
});
