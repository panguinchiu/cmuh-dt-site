"use client";

import { useCallback, useEffect, useState } from "react";
import { useWsEvent } from "@/components/ws";
import { CHOICES, CHOICE_LABEL, SIDE_LABEL, type Choice, type MatchResult, type VerdictTone } from "@/lib/game";
import { BarChart, LineChart } from "./charts";

type G = { id: string; name: string };
type M = {
  id: string;
  label: string;
  med: G | null;
  surg: G | null;
  rounds: { round: number; med: Choice | null; surg: Choice | null }[];
  result: MatchResult;
  verdict: { text: string; tone: VerdictTone };
};
type D = { game: { slug: string; title: string }; published: boolean; matches: M[]; ledger: { label: string; value: number; note: string }[]; debrief: string[] };

async function call(url: string, method: string, body?: unknown) {
  const r = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || "操作失敗");
  return r.json();
}

const teamName = (g: G | null, side: "med" | "surg") => `${g?.name ?? "（未指定）"}（${SIDE_LABEL[side].replace("隊", "")}）`;

function ChoiceCell({ value, editable, onChange }: { value: Choice | null; editable: boolean; onChange: (c: Choice | null) => void }) {
  if (!editable) return value ? <span className={`chip ${value}`}>{CHOICE_LABEL[value]}</span> : <span className="muted">—</span>;
  return (
    <select
      className={`input choice-select ${value ?? ""}`}
      value={value ?? ""}
      onChange={(e) => onChange((e.target.value || null) as Choice | null)}
      aria-label="選擇"
    >
      <option value="">—</option>
      {CHOICES.map((c) => (
        <option key={c} value={c}>
          {CHOICE_LABEL[c]}
        </option>
      ))}
    </select>
  );
}

export function Dashboard({ slug, isInstructor, groups }: { slug: string; isInstructor: boolean; groups: G[] }) {
  const [d, setD] = useState<D | null>(null);
  const [err, setErr] = useState("");
  const [projection, setProjection] = useState(false);

  const load = useCallback(async () => {
    const r = await fetch(`/api/game/${slug}/dashboard`, { cache: "no-store" });
    if (r.status === 403) return location.reload();
    if (r.ok) setD(await r.json());
  }, [slug]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);
  useWsEvent("game:update", (m) => m.slug === slug && void load());
  useWsEvent("game:publish", (m) => m.slug === slug && void load());

  useEffect(() => {
    document.body.classList.toggle("projection", projection);
    return () => document.body.classList.remove("projection");
  }, [projection]);

  const run = async (p: Promise<unknown>) => {
    setErr("");
    try {
      await p;
    } catch (e) {
      setErr((e as Error).message);
    }
    await load();
  };

  if (!d) return <p className="muted">載入中…</p>;
  const best = d.matches.filter((m) => m.result.played).sort((a, b) => b.result.joint - a.result.joint)[0];

  return (
    <div>
      {isInstructor && (
        <section className="card tight row">
          <label className="row" style={{ gap: 10, cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={d.published}
              onChange={(e) => void run(call(`/api/game/${slug}/publish`, "POST", { published: e.target.checked }))}
              style={{ width: 22, height: 22 }}
            />
            <span>
              <b>公開給學員</b>
              <span className="muted small">　{d.published ? "學員現在看得到完整儀表板、揭盅總帳與 debrief" : "目前只有講師看得到"}</span>
            </span>
          </label>
          <div className="spacer" />
          <button
            className="btn"
            onClick={() => {
              setProjection(!projection);
              if (!projection) void document.documentElement.requestFullscreen?.().catch(() => {});
              else if (document.fullscreenElement) void document.exitFullscreen();
            }}
          >
            {projection ? "離開投影模式" : "投影模式"}
          </button>
        </section>
      )}
      {!isInstructor && <div className="notice">講師已公開賽局結果（唯讀）。</div>}
      {projection && (
        <button className="btn sm projection-exit" onClick={() => (setProjection(false), document.fullscreenElement && void document.exitFullscreen())}>
          離開投影模式
        </button>
      )}
      {err && <div className="notice err">{err}</div>}

      <section className="grid c3" style={{ marginBottom: 18 }}>
        <div className="card tight stat">
          <div className="lab">已開始對局</div>
          <div className="val">
            {d.matches.filter((m) => m.result.played).length} / {d.matches.length}
          </div>
        </div>
        <div className="card tight stat">
          <div className="lab">目前共創最高</div>
          <div className="val">{best ? best.result.joint : "—"}</div>
          <div className="muted small">{best ? `${best.label}（雙方合計）` : "尚無資料"}</div>
        </div>
        <div className="card tight stat">
          <div className="lab">全程共好上限</div>
          <div className="val">242</div>
          <div className="muted small">全程自保僅 110</div>
        </div>
      </section>

      <section className="card">
        <h3>共創總價值</h3>
        <p className="muted small">越接近 242＝越快達成互信共好、共同創造越多。</p>
        <BarChart items={d.matches.map((m) => ({ name: m.label, v: m.result.joint }))} />
      </section>

      <div className="grid c2">
        {d.matches.map((m) => (
          <section key={m.id} className="card">
            <h3>
              {m.label}：{teamName(m.med, "med")} vs {teamName(m.surg, "surg")}
            </h3>
            <div className={`tone-${m.verdict.tone}`} style={{ fontWeight: 700 }}>
              {m.verdict.text}
              <span className="muted" style={{ fontWeight: 400 }}>
                　達成度 {Math.round(m.result.ratio * 100)}%・首次脫離 {m.result.defect ? `第 ${m.result.defect} 回` : "—"}
              </span>
            </div>
            <div className="tscroll" style={{ marginTop: 10 }}>
              <table className="tbl">
                <thead>
                  <tr>
                    <th>回合</th>
                    <th>內科</th>
                    <th>外科</th>
                    <th className="num">內點</th>
                    <th className="num">外點</th>
                    <th>加權</th>
                    <th className="num">內累</th>
                    <th className="num">外累</th>
                  </tr>
                </thead>
                <tbody>
                  {m.result.rows.map((r) => (
                    <tr key={r.n} className={r.weight > 1 ? "wt" : ""}>
                      <td className="mono">{r.n}</td>
                      {(["med", "surg"] as const).map((side) => (
                        <td key={side}>
                          <ChoiceCell
                            value={r[side]}
                            editable={isInstructor}
                            onChange={(c) => void run(call(`/api/game/${slug}/matches/${m.id}/rounds/${r.n}`, "PUT", { side, choice: c }))}
                          />
                        </td>
                      ))}
                      <td className="num">{r.medPts ?? "—"}</td>
                      <td className="num">{r.surgPts ?? "—"}</td>
                      <td className="mono">×{r.weight}</td>
                      <td className="num tone-accent">
                        <b>{r.medCum ?? "—"}</b>
                      </td>
                      <td className="num tone-hold">
                        <b>{r.surgCum ?? "—"}</b>
                      </td>
                    </tr>
                  ))}
                  <tr>
                    <td>合計</td>
                    <td colSpan={5} />
                    <td className="num tone-accent">
                      <b>{m.result.medTotal}</b>
                    </td>
                    <td className="num tone-hold">
                      <b>{m.result.surgTotal}</b>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div style={{ marginTop: 12 }}>
              <LineChart
                defect={m.result.defect}
                series={[
                  { name: `${teamName(m.med, "med")} 累計`, color: "var(--accent)", pts: m.result.rows.map((r) => r.medCum) },
                  { name: `${teamName(m.surg, "surg")} 累計`, color: "var(--hold)", pts: m.result.rows.map((r) => r.surgCum) },
                ]}
              />
            </div>
            {isInstructor && <MatchTools slug={slug} m={m} groups={groups} run={run} />}
          </section>
        ))}
      </div>

      <section className="card">
        <h3>揭盅總帳</h3>
        <div className="grid c3">
          {d.ledger.map((l) => (
            <div key={l.label} className="card tight" style={{ marginBottom: 0 }}>
              <div className="lab muted">{l.label}</div>
              <div className="big-num" style={{ fontSize: 44 }}>
                {l.value}
              </div>
              <p className="small" style={{ marginTop: 8, marginBottom: 0 }}>
                {l.note}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="card">
        <h3>Debrief 四問</h3>
        <ol style={{ margin: 0, paddingLeft: 22 }}>
          {d.debrief.map((q) => (
            <li key={q} style={{ marginBottom: 8 }}>
              {q}
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}

function MatchTools({ slug, m, groups, run }: { slug: string; m: M; groups: G[]; run: (p: Promise<unknown>) => Promise<void> }) {
  const [med, setMed] = useState(m.med?.id ?? "");
  const [surg, setSurg] = useState(m.surg?.id ?? "");
  const dirty = med !== (m.med?.id ?? "") || surg !== (m.surg?.id ?? "");
  return (
    <details style={{ marginTop: 12 }}>
      <summary className="muted" style={{ cursor: "pointer" }}>
        講師工具：配對／重置
      </summary>
      <div className="row" style={{ marginTop: 10 }}>
        <label className="field" style={{ margin: 0 }}>
          <span>內科隊</span>
          <select className="input" value={med} onChange={(e) => setMed(e.target.value)}>
            <option value="">（未指定）</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field" style={{ margin: 0 }}>
          <span>外科隊</span>
          <select className="input" value={surg} onChange={(e) => setSurg(e.target.value)}>
            <option value="">（未指定）</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </label>
        <button
          className="btn primary"
          style={{ alignSelf: "flex-end" }}
          disabled={!dirty}
          onClick={() => void run(call(`/api/game/${slug}/matches/${m.id}`, "PUT", { medGroupId: med || null, surgGroupId: surg || null }))}
        >
          儲存配對
        </button>
        <div className="spacer" />
        <button
          className="btn danger"
          style={{ alignSelf: "flex-end" }}
          onClick={() => {
            if (!confirm(`確定要重置「${m.label}」的全部 8 回合嗎？`)) return;
            const typed = prompt(`這個動作無法復原。請輸入對局名稱「${m.label}」確認：`);
            if (typed?.trim() !== m.label) return alert("名稱不符，已取消");
            void run(call(`/api/game/${slug}/matches/${m.id}/reset`, "POST", { confirm: "RESET" }));
          }}
        >
          重置對局
        </button>
      </div>
    </details>
  );
}
