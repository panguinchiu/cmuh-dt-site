import Link from "next/link";
import { requirePageUser } from "@/lib/current-user";
import { GameIntro } from "@/components/game/GameIntro";
import { GamePlay } from "@/components/game/GamePlay";

export default async function GamePage() {
  const user = await requirePageUser();
  return (
    <>
      <div className="kicker">賽局</div>
      <h1>加護病房床位的每月抉擇</h1>
      {user.role === "instructor" ? (
        <div className="notice">
          講師請到 <Link href="/game/dashboard">賽局儀表板</Link> 查看所有對局、代填或更正、切換「公開給學員」。下方為學員看到的說明（「規則」區塊只有講師看得到）。
        </div>
      ) : null}
      <GameIntro showRules={user.role === "instructor"} />
      {user.role === "student" ? <GamePlay slug="icu-bed" /> : null}
    </>
  );
}
