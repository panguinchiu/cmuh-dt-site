import { Shell } from "@/components/Shell";
import { WsProvider } from "@/components/ws";
import { requirePageUser } from "@/lib/current-user";
import { db } from "@/lib/db";
import { listAgenda } from "@/lib/agenda";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requirePageUser();
  const [group, agenda, game] = await Promise.all([
    user.groupId ? db.group.findUnique({ where: { id: user.groupId } }) : null,
    listAgenda(),
    db.game.findUnique({ where: { slug: "icu-bed" }, select: { published: true } }),
  ]);
  const current = agenda.items.find((i) => i.id === agenda.currentId) ?? null;
  return (
    <WsProvider>
      <Shell
        user={{ name: user.name, role: user.role, groupName: group?.name ?? null, title: user.title ?? null }}
        current={current ? { no: current.no, title: current.title } : null}
        gamePublished={!!game?.published}
      >
        {children}
      </Shell>
    </WsProvider>
  );
}
