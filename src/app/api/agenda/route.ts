import { db } from "@/lib/db";
import { requireInstructor, requireUser } from "@/lib/authz";
import { json, route } from "@/lib/http";
import { userFromRequest } from "@/lib/session";
import { agendaCreate, listAgenda, notifyAgenda } from "@/lib/agenda";
import { audit } from "@/lib/audit";

export const GET = route(async (req: Request) => {
  requireUser(await userFromRequest(req));
  return json(await listAgenda());
});

/** 新增段落（排在最後） */
export const POST = route(async (req: Request) => {
  const me = requireInstructor(await userFromRequest(req));
  const input = agendaCreate.parse(await req.json());
  const last = await db.agendaItem.aggregate({ _max: { sortOrder: true } });
  const item = await db.agendaItem.create({ data: { title: input.title, note: input.note || null, sortOrder: (last._max.sortOrder ?? 0) + 1 } });
  await audit(me.id, "agenda.create", item.id, { title: item.title });
  notifyAgenda();
  return json(await listAgenda(), 201);
});
