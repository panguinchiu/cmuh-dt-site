import { Shell } from "@/components/Shell";
import { WsProvider } from "@/components/ws";
import { requirePageUser } from "@/lib/current-user";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requirePageUser();
  const [group, state, game] = await Promise.all([
    user.groupId ? db.group.findUnique({ where: { id: user.groupId } }) : null,
    db.appState.findUnique({ where: { id: 1 } }),
    db.game.findUnique({ where: { slug: "icu-bed" }, select: { published: true } }),
  ]);
  const current = state?.currentAgendaItemId
    ? await db.agendaItem.findUnique({ where: { id: state.currentAgendaItemId } })
    : null;
  return (
    <WsProvider>
      <Shell
        user={{ name: user.name, role: user.role, groupName: group?.name ?? null, title: user.title ?? null }}
        current={current ? { seq: current.seq, time: current.time, title: current.title } : null}
        gamePublished={!!game?.published}
      >
        {children}
      </Shell>
    </WsProvider>
  );
}
