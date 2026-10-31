import Link from "next/link";
import { requirePageUser } from "@/lib/current-user";
import { listAgenda } from "@/lib/agenda";
import { listVisibleResources, publicResource } from "@/lib/resources";
import { ResourceList } from "@/components/ResourceList";
import { HeroVisual } from "@/components/HeroVisual";

const no = (n: number) => String(n).padStart(2, "0");

export default async function Home() {
  const user = await requirePageUser();
  const { items, currentId } = await listAgenda();
  const current = items.find((i) => i.id === currentId) ?? null;
  const related = current ? await listVisibleResources(user, { agendaItemId: current.id }) : [];
  const isI = user.role === "instructor";

  return (
    <>
      <section className="hero">
        <div>
          <span className="pill">設計思考工作坊 · 不含真實病人資料</span>
          <h1>
            從臨床教學的問題，
            <br />
            走到可測試的原型。
          </h1>
          <p className="lead">
            {isI ? `${user.name} 老師您好。` : `${user.name}，歡迎。`}
            今天四組各自在共編白板上定義問題、發想與收斂、提出第一個未來解方，再修正原型；中間穿插加護病房床位賽局。
          </p>
          <div className="actions">
            {isI ? (
              <Link className="btn primary" href="/overview">
                前往白板總覽　→
              </Link>
            ) : (
              <Link className="btn primary" href="/board">
                進入我的白板　→
              </Link>
            )}
            <Link className="btn" href="/resources">
              資源庫
            </Link>
          </div>
          <div className="features">
            <div>
              <h4>白板</h4>
              <p>每組一塊即時共編，課程段落各有版本，可互相複製。</p>
            </div>
            <div>
              <h4>賽局</h4>
              <p>內科隊與外科隊共用加護病房床位，八個月的每月抉擇。</p>
            </div>
            <div>
              <h4>資源</h4>
              <p>講義、連結與小遊戲，依段落與組別開放。</p>
            </div>
          </div>
        </div>
        <HeroVisual no={current ? no(current.no) : null} title={current?.title ?? null} />
      </section>

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
