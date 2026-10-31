import { z } from "zod";
import { db } from "@/lib/db";
import { requireInstructor } from "@/lib/authz";
import { json, notFound, route } from "@/lib/http";
import { userFromRequest } from "@/lib/session";
import { agendaPatch, listAgenda, notifyAgenda } from "@/lib/agenda";
import { audit } from "@/lib/audit";

type Ctx = { params: Promise<{ id: string }> };
const idSchema = z.string().uuid();

export const PATCH = route(async (req: Request, ctx: Ctx) => {
  const me = requireInstructor(await userFromRequest(req));
  const id = idSchema.parse((await ctx.params).id);
  const input = agendaPatch.parse(await req.json());
  const hit = await db.agendaItem.findUnique({ where: { id } });
  if (!hit) throw notFound();
  await db.agendaItem.update({
    where: { id },
    data: { ...(input.title !== undefined ? { title: input.title } : {}), ...(input.note !== undefined ? { note: input.note || null } : {}) },
  });
  await audit(me.id, "agenda.update", id, input);
  notifyAgenda();
  return json(await listAgenda());
});

/** 刪除段落；若「目前段落」指向它則清空 */
export const DELETE = route(async (req: Request, ctx: Ctx) => {
  const me = requireInstructor(await userFromRequest(req));
  const id = idSchema.parse((await ctx.params).id);
  const hit = await db.agendaItem.findUnique({ where: { id } });
  if (!hit) throw notFound();
  await db.$transaction([
    db.appState.updateMany({ where: { currentAgendaItemId: id }, data: { currentAgendaItemId: null } }),
    db.agendaItem.delete({ where: { id } }),
  ]);
  await audit(me.id, "agenda.delete", id, { title: hit.title });
  notifyAgenda();
  return json(await listAgenda());
});
