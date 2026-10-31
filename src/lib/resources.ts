import type { Prisma } from "@prisma/client";
import { db } from "./db";
import { canViewResource, type ResourceRef, type SessionUser } from "./authz";

export const resourceInclude = { groups: true, users: true } satisfies Prisma.ResourceInclude;
type Row = Prisma.ResourceGetPayload<{ include: typeof resourceInclude }>;

export const toRef = (r: Row): ResourceRef => ({
  visibility: r.visibility,
  groupIds: r.groups.map((g) => g.groupId),
  userIds: r.users.map((u) => u.userId),
});

/** 依 authz.canViewResource 過濾；學員看不到的資源連存在都不回傳 */
export async function listVisibleResources(user: SessionUser, where: Prisma.ResourceWhereInput = {}) {
  const rows = await db.resource.findMany({
    where,
    include: resourceInclude,
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });
  return rows.filter((r) => canViewResource(user, toRef(r)));
}

/** 取單一資源；不可見與不存在一律回 null（呼叫端回 404，不洩漏存在） */
export async function getVisibleResource(user: SessionUser, id: string) {
  const r = await db.resource.findUnique({ where: { id }, include: resourceInclude });
  if (!r || !canViewResource(user, toRef(r))) return null;
  return r;
}

export function publicResource(r: Row, instructor: boolean) {
  return {
    id: r.id,
    title: r.title,
    description: r.description,
    type: r.type,
    url: r.type === "link" ? r.url : null,
    fileName: r.fileName,
    size: r.size,
    agendaItemId: r.agendaItemId,
    sortOrder: r.sortOrder,
    ...(instructor
      ? { visibility: r.visibility, groupIds: r.groups.map((g) => g.groupId), userIds: r.users.map((u) => u.userId) }
      : {}),
  };
}
export type PublicResource = ReturnType<typeof publicResource>;
