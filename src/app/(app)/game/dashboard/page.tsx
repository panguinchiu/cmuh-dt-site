import { db } from "@/lib/db";
import { canViewGameDashboard, isInstructor } from "@/lib/authz";
import { requirePageUser } from "@/lib/current-user";
import { Dashboard } from "@/components/game/Dashboard";

export default async function GameDashboardPage() {
  const user = await requirePageUser();
  const game = await db.game.findUnique({ where: { slug: "icu-bed" } });
  if (!game || !canViewGameDashboard(user, game)) {
    return (
      <>
        <h1>賽局結果</h1>
        <div className="notice">講師尚未公開賽局結果。</div>
      </>
    );
  }
  const groups = isInstructor(user) ? await db.group.findMany({ orderBy: { sortOrder: "asc" }, select: { id: true, name: true } }) : [];
  return (
    <>
      <div className="kicker">賽局{isInstructor(user) ? "儀表板" : "結果"}</div>
      <h1>{game.title}</h1>
      <Dashboard slug={game.slug} isInstructor={isInstructor(user)} groups={groups} />
    </>
  );
}
