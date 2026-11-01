import { z } from "zod";
import { db } from "@/lib/db";
import {
  assert,
  canManageResource,
  canSetResourceVisibility,
  isInstructor,
  requireUser,
} from "@/lib/authz";
import { json, notFound, route } from "@/lib/http";
import { userFromRequest } from "@/lib/session";
import {
  getVisibleResource,
  publicResource,
  resourceInclude,
} from "@/lib/resources";
import { linkUrl, normalizeMeta, resourceMeta } from "@/lib/resource-input";
import { deletePrefix } from "@/lib/blob";
import { audit } from "@/lib/audit";

type Ctx = { params: Promise<{ id: string }> };
const id = z.string().uuid();

/** 編輯標題、說明、可見範圍、綁定段落、排序（連結可改網址）；講師全部、學員只限自己上傳的 */
export const PATCH = route(async (req: Request, ctx: Ctx) => {
  const me = requireUser(await userFromRequest(req));
  const rid = id.safeParse((await ctx.params).id);
  if (!rid.success) throw notFound();
  // 看不到的資源一律 404（不洩漏存在）；看得到但不是自己的 → 403
  const cur = await getVisibleResource(me, rid.data);
  if (!cur) throw notFound();
  assert(canManageResource(me, cur));
  const body = resourceMeta
    .extend({ url: linkUrl.optional() })
    .parse(await req.json());
  const meta = await normalizeMeta(body);
  assert(canSetResourceVisibility(me, meta));
  const r = await db.$transaction(async (tx) => {
    await tx.resourceGroup.deleteMany({ where: { resourceId: cur.id } });
    await tx.resourceUser.deleteMany({ where: { resourceId: cur.id } });
    return tx.resource.update({
      where: { id: cur.id },
      data: {
        title: meta.title,
        description: meta.description,
        visibility: meta.visibility,
        agendaItemId: meta.agendaItemId,
        sortOrder: meta.sortOrder,
        ...(cur.type === "link" && body.url ? { url: body.url } : {}),
        groups: { create: meta.groupIds.map((groupId) => ({ groupId })) },
        users: { create: meta.userIds.map((userId) => ({ userId })) },
      },
      include: resourceInclude,
    });
  });
  await audit(me.id, "resource.update", r.id, { visibility: r.visibility });
  return json(publicResource(r, isInstructor(me), me.id));
});

export const DELETE = route(async (req: Request, ctx: Ctx) => {
  const me = requireUser(await userFromRequest(req));
  const rid = id.safeParse((await ctx.params).id);
  if (!rid.success) throw notFound();
  // 看不到的資源一律 404（不洩漏存在）；看得到但不是自己的 → 403
  const cur = await getVisibleResource(me, rid.data);
  if (!cur) throw notFound();
  assert(canManageResource(me, cur));
  await db.resource.delete({ where: { id: cur.id } });
  if (cur.blobKey)
    await deletePrefix(cur.blobKey).catch((e) =>
      console.error("[resource] blob delete", e),
    );
  await audit(me.id, "resource.delete", cur.id, { title: cur.title });
  return json({ ok: true });
});
