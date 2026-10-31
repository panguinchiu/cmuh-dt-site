import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/current-user";
import { LoginFlow } from "./LoginFlow";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  if (await getCurrentUser()) redirect("/");
  const [groups, instructors] = await Promise.all([
    db.group.findMany({
      orderBy: { sortOrder: "asc" },
      include: { users: { where: { active: true, role: "student" }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] } },
    }),
    db.user.findMany({ where: { role: "instructor", active: true }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
  ]);
  return (
    <LoginFlow
      groups={groups.map((g) => ({ id: g.id, name: g.name, users: g.users.map((u) => ({ id: u.id, name: u.name, title: u.title, hasPassword: !!u.passwordHash })) }))}
      instructors={instructors.map((u) => ({ id: u.id, name: u.name, title: null, hasPassword: !!u.passwordHash }))}
    />
  );
}
