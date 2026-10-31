import { db } from "@/lib/db";
import { requireInstructor } from "@/lib/authz";
import { HttpError, json, route } from "@/lib/http";
import { userFromRequest } from "@/lib/session";
import { agendaOrder, listAgenda, notifyAgenda } from "@/lib/agenda";
import { audit } from "@/lib/audit";

/** 調整排序：ids 必須剛好是全部段落的一種排列 */
export const PUT = route(async (req: Request) => {
  const me = requireInstructor(await userFromRequest(req));
  const { ids } = agendaOrder.parse(await req.json());
  const all = await db.agendaItem.findMany({ select: { id: true } });
  const known = new Set(all.map((a) => a.id));
  if (new Set(ids).size !== ids.length || ids.length !== known.size || !ids.every((id) => known.has(id))) {
    throw new HttpError(400, "排序清單必須包含全部段落且不重複");
  }
  await db.$transaction(ids.map((id, i) => db.agendaItem.update({ where: { id }, data: { sortOrder: i + 1 } })));
  await audit(me.id, "agenda.reorder", undefined, { ids });
  notifyAgenda();
  return json(await listAgenda());
});
