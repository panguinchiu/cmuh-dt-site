"use client";

import { useCallback, useEffect, useState } from "react";
import { useWsEvent } from "@/components/ws";
import { CHOICES, CHOICE_LABEL, COOP_MAX, SIDE_LABEL, type Choice } from "@/lib/game";
import { LineChart } from "./charts";

type Me = {
  game: { slug: string; title: string; published: boolean };
  match: null | {
    id: string;
    label: string;
    side: "med" | "surg";
    me: { name: string } | null;
    opponent: { name: string } | null;
    rounds: { round: number; mine: Choice | null; theirs: Choice | null; theirsSubmitted: boolean; revealed: boolean }[];
    rows: { n: number; weight: number; myPts: number | null; myCum: number | null; opCum: number | null }[];
    myTotal: number;
    opTotal: number;
    completed: number;
    defect: number | null;
    played: boolean;
  };
};

export function GamePlay({ slug }: { slug: string }) {
  const [d, setD] = useState<Me | null>(null);
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState<number | null>(null);

  const load = useCallback(async () => {
    const r = await fetch(`/api/game/${slug}/me`, { cache: "no-store" });
    if (r.ok) setD(await r.json());
  }, [slug]);
  useEffect(() => {
    // 首次載入
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);
  useWsEvent("game:update", (m) => m.slug === slug && void load());

  if (!d) return <p className="muted">載入中…</p>;
  const m = d.match;
  if (!m) return <div className="notice">你的組別目前沒有被安排在任何對局，請洽講師。</div>;

  const choose = async (round: number, choice: Choice) => {
    setErr("");
    setSaving(round);
    const r = await fetch(`/api/game/${slug}/matches/${m.id}/rounds/${round}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ side: m.side, choice }),
    });
    setSaving(null);
    if (!r.ok) setErr((await r.json().catch(() => ({}))).error || "送出失敗");
    await load();
  };

  const myName = `${m.me?.name ?? ""}（${SIDE_LABEL[m.side]}）`;
  const opName = `${m.opponent?.name ?? "對手"}（${SIDE_LABEL[m.side === "med" ? "surg" : "med"]}）`;

  return (
    <>
      <section className="card">
        <div className="row" style={{ alignItems: "flex-end" }}>
          <div>
            <div className="kicker">
              {m.label}｜{myName}
            </div>
            <div className="stat">
              <div className="lab">我方加權累計</div>
            </div>
            <div className="big-num">{m.myTotal}</div>
            <div className="muted" style={{ marginTop: "calc(8px * var(--z))" }}>
              對手 {opName}：<b className="mono">{m.opTotal}</b>｜距全程共好上限 {COOP_MAX} 還差 <span className="mono">{Math.max(0, COOP_MAX - m.myTotal)}</span>
            </div>
          </div>
          <div className="spacer" />
          <div className="grid c3" style={{ minWidth: "calc(420px * var(--z))", flex: "0 1 520px" }}>
            <div className="stat">
              <div className="lab">完成回合</div>
              <div className="val">{m.completed} / 8</div>
            </div>
            <div className="stat">
              <div className="lab">共好達成度</div>
              <div className="val">{Math.round((m.myTotal / COOP_MAX) * 100)}%</div>
            </div>
            <div className="stat">
              <div className="lab">首次脫離共好</div>
              <div className="val">{m.defect ? `第 ${m.defect} 回` : m.played ? "尚未" : "—"}</div>
            </div>
          </div>
        </div>
        <div style={{ marginTop: "calc(18px * var(--z))" }}>
          <LineChart
            defect={m.defect}
            series={[
              { name: `${myName}累計`, color: "var(--accent)", pts: m.rows.map((r) => r.myCum) },
              { name: `${opName}累計`, color: "var(--hold)", pts: m.rows.map((r) => r.opCum) },
            ]}
          />
        </div>
      </section>

      <section className="card">
        <h3>逐回合作答</h3>
        <p className="muted small">只填「我方選擇」；對方選擇由對方組填寫。兩隊都出牌後同時揭曉，揭曉後如需更正請找講師。</p>
        {err && <div className="notice err">{err}</div>}
        <div className="tscroll">
          <table className="tbl">
            <thead>
              <tr>
                <th>回合</th>
                <th>我方選擇</th>
                <th>對方選擇</th>
                <th className="num">我方本回合</th>
                <th>加權</th>
                <th className="num">我方累計</th>
                <th className="num">對方累計</th>
              </tr>
            </thead>
            <tbody>
              {m.rounds.map((r, i) => {
                const row = m.rows[i];
                return (
                  <tr key={r.round} className={row.weight > 1 ? "wt" : ""}>
                    <td className="mono">{r.round}</td>
                    <td>
                      <div className="seg" role="group" aria-label={`第 ${r.round} 回合我方選擇`}>
                        {CHOICES.map((c) => (
                          <button
                            key={c}
                            className={`${c} ${r.mine === c ? "on" : ""}`}
                            disabled={r.revealed || saving === r.round}
                            onClick={() => void choose(r.round, c)}
                          >
                            {CHOICE_LABEL[c]}
                          </button>
                        ))}
                      </div>
                    </td>
                    <td>
                      {r.revealed && r.theirs ? (
                        <span className={`chip ${r.theirs}`}>{CHOICE_LABEL[r.theirs]}</span>
                      ) : r.theirsSubmitted ? (
                        <span className="badge">已出牌</span>
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                    <td className="num">{row.myPts ?? "—"}</td>
                    <td>
                      ×{row.weight}
                      {row.weight > 1 ? <span className="badge warn" style={{ marginLeft: "calc(6px * var(--z))" }}>加權</span> : null}
                    </td>
                    <td className="num tone-accent">
                      <b>{row.myCum ?? "—"}</b>
                    </td>
                    <td className="num tone-hold">
                      <b>{row.opCum ?? "—"}</b>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
