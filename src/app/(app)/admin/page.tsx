import { redirect } from "next/navigation";
import { requirePageUser } from "@/lib/current-user";
import { isInstructor } from "@/lib/authz";
import { listAgenda } from "@/lib/agenda";
import { AgendaEditor } from "@/components/AgendaEditor";

export default async function AdminPage() {
  const user = await requirePageUser();
  if (!isInstructor(user)) redirect("/");
  const agenda = await listAgenda();
  return (
    <>
      <h1>管理</h1>
      <section className="card" id="agenda">
        <h2>議程段落</h2>
        <p className="muted small">只有順序與標題，不顯示時間。「目前段落」只由講師手動切換，所有人首頁即時更新。</p>
        <AgendaEditor initial={agenda} />
      </section>
    </>
  );
}
