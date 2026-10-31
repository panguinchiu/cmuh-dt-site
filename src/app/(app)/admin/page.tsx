import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requirePageUser } from "@/lib/current-user";
import { isInstructor } from "@/lib/authz";
import { listAgenda } from "@/lib/agenda";
import { AgendaEditor } from "@/components/AgendaEditor";
import { AdminPeople } from "@/components/AdminPeople";

export default async function AdminPage() {
  const user = await requirePageUser();
  if (!isInstructor(user)) redirect("/");
  const [agenda, groups, students, instructors] = await Promise.all([
    listAgenda(),
    db.group.findMany({ orderBy: { sortOrder: "asc" }, select: { id: true, name: true } }),
    db.user.findMany({ where: { role: "student" }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
    db.user.findMany({ where: { role: "instructor", active: true }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
  ]);
  return (
    <>
      <h1>管理</h1>
      <nav className="row small" style={{ marginBottom: "calc(16px * var(--z))" }}>
        <a href="#agenda">議程</a>
        <a href="#students">學員</a>
        <a href="#codes">組別代碼</a>
        <a href="#instructors">講師</a>
        <Link href="/game/dashboard">賽局設定（配對／重置／公開）</Link>
      </nav>
      <section className="card" id="agenda">
        <h2>議程段落</h2>
        <p className="muted small">只有順序與標題，不顯示時間。「目前段落」只由講師手動切換，所有人首頁即時更新。</p>
        <AgendaEditor initial={agenda} />
      </section>
      <AdminPeople
        groups={groups}
        students={students.map((s) => ({ id: s.id, name: s.name, title: s.title, groupId: s.groupId, active: s.active }))}
        instructors={instructors.map((i) => ({ id: i.id, name: i.name, isMe: i.id === user.id }))}
      />
    </>
  );
}
