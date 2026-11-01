import { db } from "@/lib/db";
import { requirePageUser } from "@/lib/current-user";
import { listAgenda } from "@/lib/agenda";
import { listVisibleResources, publicResource } from "@/lib/resources";
import { ResourceManager } from "@/components/ResourceManager";

export default async function ResourcesPage() {
  const user = await requirePageUser();
  const rows = await listVisibleResources(user);
  if (user.role !== "instructor") {
    // 學員：可上傳；可見範圍只能選全體學員／自己這組／僅講師，只能改自己上傳的
    const [myGroup, agenda] = await Promise.all([
      user.groupId
        ? db.group.findUnique({
            where: { id: user.groupId },
            select: { id: true, name: true },
          })
        : null,
      listAgenda(),
    ]);
    return (
      <>
        <h1>資源庫</h1>
        <ResourceManager
          instructor={false}
          myGroupId={myGroup?.id ?? null}
          resources={rows.map((r) => publicResource(r, false, user.id))}
          groups={myGroup ? [myGroup] : []}
          students={[]}
          agenda={agenda.items.map(({ id, no, title }) => ({ id, no, title }))}
        />
      </>
    );
  }
  const [groups, students, agenda] = await Promise.all([
    db.group.findMany({
      orderBy: { sortOrder: "asc" },
      select: { id: true, name: true },
    }),
    db.user.findMany({
      where: { role: "student", active: true },
      include: { group: true },
      orderBy: [{ group: { sortOrder: "asc" } }, { sortOrder: "asc" }],
    }),
    listAgenda(),
  ]);
  return (
    <>
      <h1>資源庫</h1>
      <ResourceManager
        resources={rows.map((r) => publicResource(r, true, user.id))}
        groups={groups}
        students={students.map((s) => ({
          id: s.id,
          name: s.name,
          groupName: s.group?.name ?? "",
        }))}
        agenda={agenda.items.map(({ id, no, title }) => ({ id, no, title }))}
      />
    </>
  );
}
