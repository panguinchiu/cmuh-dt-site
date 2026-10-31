import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePageUser } from "@/lib/current-user";
import { getVisibleResource } from "@/lib/resources";
import { playUrl } from "@/lib/play-token";

/** HTML 遊戲：sandbox iframe（只給 allow-scripts；不給 allow-same-origin / top-navigation / popups / forms） */
export default async function PlayPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePageUser();
  const { id } = await params;
  const r = /^[0-9a-f-]{36}$/i.test(id) ? await getVisibleResource(user, id) : null;
  if (!r || r.type !== "html_game") notFound();
  return (
    <>
      <div className="row" style={{ marginBottom: "calc(12px * var(--z))" }}>
        <Link className="btn sm" href="/resources">
          返回資源庫
        </Link>
        <h2 style={{ margin: 0 }}>{r.title}</h2>
      </div>
      <iframe
        title={r.title}
        src={playUrl(r.id, user.id)}
        sandbox="allow-scripts"
        referrerPolicy="no-referrer"
        style={{ width: "100%", height: "calc(100vh - 200px)", minHeight: "calc(480px * var(--z))", border: "1px solid var(--line)", borderRadius: 5, background: "#fff" }}
      />
    </>
  );
}
