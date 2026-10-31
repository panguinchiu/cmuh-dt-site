import Link from "next/link";
import { requirePageUser } from "@/lib/current-user";
import { listAgenda } from "@/lib/agenda";
import { listVisibleResources, publicResource } from "@/lib/resources";
import { ResourceList } from "@/components/ResourceList";

const no = (n: number) => String(n).padStart(2, "0");

export default async function Home() {
  const user = await requirePageUser();
  const { items, currentId } = await listAgenda();
  const current = items.find((i) => i.id === currentId) ?? null;
  const related = current ? await listVisibleResources(user, { agendaItemId: current.id }) : [];
  const isI = user.role === "instructor";

  return (
    <>
      <div className="kicker">今日議程</div>
      <h1>{isI ? `${user.name} 老師，您好` : `${user.name}，歡迎`}</h1>

      <div className="grid c2" style={{ alignItems: "start" }}>
        <section className="card">
          <div className="kicker">目前段落</div>
          {current ? (
            <>
              <h2 style={{ marginBottom: "calc(4px * var(--z))" }}>
                <span className="mono" style={{ color: "var(--accent)" }}>
                  {no(current.no)}
                </span>
                　{current.title}
              </h2>
              {current.note ? <p className="muted">{current.note}</p> : null}
              <h3 style={{ marginTop: "calc(18px * var(--z))" }}>本段落資源</h3>
              <ResourceList items={related.map((r) => publicResource(r, isI))} empty="本段落沒有指定資源" />
            </>
          ) : (
            <p className="muted">講師尚未開始今天的課程。</p>
          )}
          <div className="row" style={{ marginTop: "calc(18px * var(--z))" }}>
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
                <span className="seq">{no(i.no)}</span>
                <span>
                  {i.title}
                  {i.id === current?.id ? <span className="badge accent" style={{ marginLeft: "calc(8px * var(--z))" }}>進行中</span> : null}
                </span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </>
  );
}
