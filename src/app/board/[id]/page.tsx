import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { canEditBoard } from "@/lib/authz";
import { requirePageUser } from "@/lib/current-user";
import { uuid } from "@/lib/boards";
import { BoardLoader } from "@/components/board/BoardLoader";

export const dynamic = "force-dynamic";

export default async function BoardPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePageUser();
  const { id } = await params;
  if (!uuid.safeParse(id).success) notFound();
  const board = await db.board.findUnique({ where: { id }, include: { group: true } });
  if (!board) notFound();
  if (!canEditBoard(user, board)) {
    return (
      <div className="login-wrap">
        <div className="kicker">403</div>
        <h1>沒有權限</h1>
        <p className="muted">這是其他組的白板，你只能進入自己組的白板。</p>
        <Link className="btn primary" href="/board">
          回我的白板
        </Link>
      </div>
    );
  }
  return <BoardLoader boardId={board.id} groupName={board.group.name} backHref={user.role === "instructor" ? "/overview" : "/"} />;
}
