import { z } from "zod";
import { db } from "./db";
import { broadcast } from "./hub";

export const agendaCreate = z.object({ title: z.string().trim().min(1).max(100), note: z.string().trim().max(500).optional() });
export const agendaPatch = z
  .object({ title: z.string().trim().min(1).max(100).optional(), note: z.string().trim().max(500).nullable().optional() })
  .refine((v) => v.title !== undefined || v.note !== undefined, "沒有要更新的欄位");
export const agendaOrder = z.object({ ids: z.array(z.string().uuid()).min(1).max(200) });
export const agendaCurrent = z.object({ id: z.string().uuid().nullable() });

export async function listAgenda() {
  const [items, state] = await Promise.all([
    db.agendaItem.findMany({ orderBy: [{ sortOrder: "asc" }, { title: "asc" }] }),
    db.appState.findUnique({ where: { id: 1 } }),
  ]);
  return {
    items: items.map((i, idx) => ({ id: i.id, no: idx + 1, title: i.title, note: i.note })),
    currentId: state?.currentAgendaItemId ?? null,
  };
}

/** 議程有任何變動：通知所有連線重新整理首頁/頂列 */
export const notifyAgenda = (kind: "update" | "current" = "update") => broadcast({ type: `agenda:${kind}` });
