import { db } from "@/lib/db";
import { requireInstructor } from "@/lib/authz";
import { json, notFound, route } from "@/lib/http";
import { userFromRequest } from "@/lib/session";
import { agendaCurrent, listAgenda, notifyAgenda } from "@/lib/agenda";
import { audit } from "@/lib/audit";

/** 切換「目前段落」（只由講師手動切換；null = 清空） */
export const PUT = route(async (req: Request) => {
  const me = requireInstructor(await userFromRequest(req));
  const { id } = agendaCurrent.parse(await req.json());
  if (id && !(await db.agendaItem.findUnique({ where: { id } }))) throw notFound();
  await db.appState.upsert({ where: { id: 1 }, update: { currentAgendaItemId: id }, create: { id: 1, currentAgendaItemId: id } });
  await audit(me.id, "agenda.current", id ?? undefined);
  notifyAgenda("current");
  return json(await listAgenda());
});
