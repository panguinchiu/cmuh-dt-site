import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { isInstructor } from "@/lib/authz";
import { requirePageUser } from "@/lib/current-user";
import { listAgenda } from "@/lib/agenda";
import { OverviewLoader } from "@/components/OverviewLoader";

export default async function OverviewPage() {
  const user = await requirePageUser();
  if (!isInstructor(user)) redirect("/board");
  const [groups, agenda] = await Promise.all([db.group.findMany({ orderBy: { sortOrder: "asc" }, include: { board: true } }), listAgenda()]);
  const boards = groups.filter((g) => g.board).map((g) => ({ boardId: g.board!.id, groupName: g.name }));
  return (
    <>
      <div className="kicker">講師</div>
      <h1>白板總覽</h1>
      <OverviewLoader boards={boards} agenda={{ items: agenda.items.map(({ id, no, title }) => ({ id, no, title })), currentId: agenda.currentId }} />
    </>
  );
}
