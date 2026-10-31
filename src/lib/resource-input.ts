import { z } from "zod";
import { db } from "./db";
import { HttpError } from "./http";

export const resourceMeta = z.object({
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().max(1000).optional().nullable(),
  visibility: z.enum(["all_students", "groups", "users", "instructors_only"]),
  groupIds: z.array(z.string().uuid()).max(50).default([]),
  userIds: z.array(z.string().uuid()).max(200).default([]),
  agendaItemId: z.string().uuid().nullable().optional(),
  sortOrder: z.coerce.number().int().min(-10000).max(10000).default(0),
});
export type ResourceMeta = z.infer<typeof resourceMeta>;

export const linkUrl = z
  .string()
  .trim()
  .url()
  .max(2000)
  .refine((u) => /^https?:\/\//i.test(u), "只接受 http/https 連結");

/** 檢查指定的組別/學員/段落存在，並依可見範圍只保留需要的關聯 */
export async function normalizeMeta(m: ResourceMeta) {
  const groupIds = m.visibility === "groups" ? [...new Set(m.groupIds)] : [];
  const userIds = m.visibility === "users" ? [...new Set(m.userIds)] : [];
  if (m.visibility === "groups" && !groupIds.length) throw new HttpError(400, "請至少選一個組別");
  if (m.visibility === "users" && !userIds.length) throw new HttpError(400, "請至少選一位學員");
  if (groupIds.length && (await db.group.count({ where: { id: { in: groupIds } } })) !== groupIds.length) throw new HttpError(400, "組別不存在");
  if (userIds.length && (await db.user.count({ where: { id: { in: userIds }, role: "student" } })) !== userIds.length) throw new HttpError(400, "學員不存在");
  if (m.agendaItemId && !(await db.agendaItem.findUnique({ where: { id: m.agendaItemId } }))) throw new HttpError(400, "段落不存在");
  return { ...m, groupIds, userIds, agendaItemId: m.agendaItemId ?? null, description: m.description || null };
}
