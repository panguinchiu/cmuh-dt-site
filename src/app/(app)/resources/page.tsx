import { db } from "@/lib/db";
import { isInstructor } from "@/lib/authz";
import { requirePageUser } from "@/lib/current-user";
import { listAgenda } from "@/lib/agenda";
import { listVisibleResources, publicResource } from "@/lib/resources";
import { ResourceList } from "@/components/ResourceList";
import { ResourceManager } from "@/components/ResourceManager";

export default async function ResourcesPage() {
  const user = await requirePageUser();
  const rows = await listVisibleResources(user);
  if (!isInstructor(user)) {
    return (
      <>
        <h1>資源庫</h1>
        <section className="card">
          <ResourceList items={rows.map((r) => publicResource(r, false))} empty="目前沒有開放給你的資源" />
        </section>
      </>
    );
  }
  const [groups, students, agenda] = await Promise.all([
    db.group.findMany({ orderBy: { sortOrder: "asc" }, select: { id: true, name: true } }),
    db.user.findMany({ where: { role: "student", active: true }, include: { group: true }, orderBy: [{ group: { sortOrder: "asc" } }, { sortOrder: "asc" }] }),
    listAgenda(),
  ]);
  return (
    <>
      <h1>資源庫</h1>
      <ResourceManager
        resources={rows.map((r) => publicResource(r, true))}
        groups={groups}
        students={students.map((s) => ({ id: s.id, name: s.name, groupName: s.group?.name ?? "" }))}
        agenda={agenda.items.map(({ id, no, title }) => ({ id, no, title }))}
      />
    </>
  );
}
