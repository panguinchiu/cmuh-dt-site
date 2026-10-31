import Link from "next/link";
import { db } from "@/lib/db";
import { requirePageUser } from "@/lib/current-user";
import { listVisibleResources, publicResource } from "@/lib/resources";
import { ResourceList } from "@/components/ResourceList";

export default async function Home() {
  const user = await requirePageUser();
  const [items, state] = await Promise.all([
    db.agendaItem.findMany({ orderBy: { sortOrder: "asc" } }),
    db.appState.findUnique({ where: { id: 1 } }),
  ]);
  const current = items.find((i) => i.id === state?.currentAgendaItemId) ?? null;
  const related = current ? await listVisibleResources(user, { agendaItemId: current.id }) : [];
  const isI = user.role === "instructor";

  return (
    <>
      <div className="kicker">2026-11-01 · 今日議程</div>
      <h1>{isI ? `${user.name} 老師，早安` : `${user.name}，歡迎`}</h1>

      <div className="grid c2" style={{ alignItems: "start" }}>
        <section className="card">
          <div className="kicker">目前時段</div>
          {current ? (
            <>
              <h2 style={{ marginBottom: 4 }}>
                <span className="mono" style={{ color: "var(--accent)" }}>
                  {current.time}
                </span>
                　{current.title}
              </h2>
              {current.note ? <p className="muted">{current.note}</p> : null}
              <h3 style={{ marginTop: 18 }}>本時段資源</h3>
              <ResourceList items={related.map((r) => publicResource(r, isI))} empty="本時段沒有指定資源" />
            </>
          ) : (
            <p className="muted">講師尚未開始今天的課程。</p>
          )}
          <div className="row" style={{ marginTop: 18 }}>
            {isI ? (
              <Link className="btn primary" href="/overview">
                前往白板總覽
              </Link>
            ) : (
              <Link className="btn primary" href="/board">
                進入我的白板
              </Link>
            )}
            <Link className="btn" href="/resources">
              資源庫
            </Link>
          </div>
        </section>

        <section className="card">
          <h3>今日議程</h3>
          <ul className="agenda">
            {items.map((i) => (
              <li key={i.id} className={i.id === current?.id ? "cur" : ""}>
                <span className="seq">{i.seq}</span>
                <span className="tm">{i.time}</span>
                <span>
                  {i.title}
                  {i.id === current?.id ? <span className="badge accent" style={{ marginLeft: 8 }}>進行中</span> : null}
                </span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </>
  );
}
