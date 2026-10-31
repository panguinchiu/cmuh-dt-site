/**
 * HTML 遊戲 proxy：驗 token＋使用者＋可見範圍後，從 Blob 串流回應。
 * 回應帶 CSP sandbox（無 allow-same-origin → opaque origin，讀不到主站 cookie/storage/DOM）、
 * connect-src 'none'，且絕不回傳 Set-Cookie。
 */
import { db } from "@/lib/db";
import { canViewResource } from "@/lib/authz";
import { gameHeaders, readPlayToken } from "@/lib/play-token";
import { resourceInclude, toRef } from "@/lib/resources";
import { getBlob } from "@/lib/blob";
import { mimeOf, safePath } from "@/lib/uploads";

type Ctx = { params: Promise<{ id: string; token: string; path: string[] }> };

const notFound = () => new Response("Not found", { status: 404, headers: gameHeaders("text/plain; charset=utf-8") });

export async function GET(_req: Request, ctx: Ctx) {
  const { id, token, path } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return notFound();
  const t = readPlayToken(token, id);
  if (!t) return notFound();
  const rel = safePath(path.map(decodeURIComponent).join("/"));
  if (!rel) return notFound();
  const [user, r] = await Promise.all([
    db.user.findUnique({ where: { id: t.userId } }),
    db.resource.findUnique({ where: { id }, include: resourceInclude }),
  ]);
  if (!user?.active || !r || r.type !== "html_game" || !r.blobKey) return notFound();
  if (!canViewResource({ id: user.id, name: user.name, role: user.role, groupId: user.groupId }, toRef(r))) return notFound();
  const blob = await getBlob(`${r.blobKey}/${rel}`);
  if (!blob) return notFound();
  return new Response(blob.stream, { status: 200, headers: gameHeaders(mimeOf(rel)) });
}
