import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requirePageUser } from "@/lib/current-user";

/** 學員：導向自己組的白板；講師：導向總覽 */
export default async function MyBoard() {
  const user = await requirePageUser();
  if (user.role === "instructor" || !user.groupId) redirect("/overview");
  const board = await db.board.findUnique({ where: { groupId: user.groupId } });
  if (!board) redirect("/");
  redirect(`/board/${board.id}`);
}
