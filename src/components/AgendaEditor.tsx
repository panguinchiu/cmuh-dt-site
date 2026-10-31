"use client";

import { useCallback, useState } from "react";
import { useWsEvent } from "./ws";

type Item = { id: string; no: number; title: string; note: string | null };

const no = (n: number) => String(n).padStart(2, "0");

async function call(url: string, method: string, body?: unknown) {
  const r = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || "操作失敗");
  return d as { items: Item[]; currentId: string | null };
}

/** 講師：議程新增／刪除／改標題／排序／切換目前段落 */
export function AgendaEditor({ initial }: { initial: { items: Item[]; currentId: string | null } }) {
  const [data, setData] = useState(initial);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [newTitle, setNewTitle] = useState("");
  const [err, setErr] = useState("");

  const refresh = useCallback(async () => setData(await call("/api/agenda", "GET")), []);
  useWsEvent("agenda:update", () => void refresh());
  useWsEvent("agenda:current", () => void refresh());

  const run = async (p: Promise<{ items: Item[]; currentId: string | null }>) => {
    setErr("");
    try {
      setData(await p);
    } catch (e) {
      setErr((e as Error).message);
    }
  };

  const move = (i: number, d: -1 | 1) => {
    const ids = data.items.map((x) => x.id);
    const j = i + d;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    void run(call("/api/agenda/order", "PUT", { ids }));
  };

  return (
    <div>
      {err && <div className="notice err">{err}</div>}
      <table className="tbl">
        <thead>
          <tr>
            <th style={{ width: 48 }}>#</th>
            <th>段落標題</th>
            <th style={{ width: 340 }}>操作</th>
          </tr>
        </thead>
        <tbody>
          {data.items.map((it, i) => {
            const draft = drafts[it.id] ?? it.title;
            const dirty = draft.trim() !== it.title;
            const cur = it.id === data.currentId;
            return (
              <tr key={it.id} className={cur ? "wt" : ""}>
                <td className="mono">{no(it.no)}</td>
                <td>
                  <div className="row" style={{ flexWrap: "nowrap" }}>
                    <input className="input" value={draft} maxLength={100} onChange={(e) => setDrafts({ ...drafts, [it.id]: e.target.value })} />
                    {dirty && (
                      <button
                        className="btn sm primary"
                        disabled={!draft.trim()}
                        onClick={() =>
                          void run(call(`/api/agenda/${it.id}`, "PATCH", { title: draft.trim() })).then(() =>
                            setDrafts((d) => {
                              const rest = { ...d };
                              delete rest[it.id];
                              return rest;
                            }),
                          )
                        }
                      >
                        儲存
                      </button>
                    )}
                  </div>
                </td>
                <td>
                  <div className="row" style={{ gap: 6 }}>
                    <button className="btn sm" onClick={() => move(i, -1)} disabled={i === 0} aria-label="上移">
                      上移
                    </button>
                    <button className="btn sm" onClick={() => move(i, 1)} disabled={i === data.items.length - 1} aria-label="下移">
                      下移
                    </button>
                    {cur ? (
                      <span className="badge accent">目前段落</span>
                    ) : (
                      <button className="btn sm" onClick={() => void run(call("/api/agenda/current", "PUT", { id: it.id }))}>
                        設為目前
                      </button>
                    )}
                    <button
                      className="btn sm danger"
                      onClick={() => {
                        if (confirm(`確定刪除「${it.title}」？${cur ? "（這是目前段落，刪除後目前段落會清空）" : ""}`))
                          void run(call(`/api/agenda/${it.id}`, "DELETE"));
                      }}
                    >
                      刪除
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <form
        className="row"
        style={{ marginTop: 14 }}
        onSubmit={(e) => {
          e.preventDefault();
          if (!newTitle.trim()) return;
          void run(call("/api/agenda", "POST", { title: newTitle.trim() })).then(() => setNewTitle(""));
        }}
      >
        <input className="input" style={{ maxWidth: 420 }} placeholder="新增段落標題" value={newTitle} maxLength={100} onChange={(e) => setNewTitle(e.target.value)} />
        <button className="btn primary" disabled={!newTitle.trim()}>
          新增段落
        </button>
        {data.currentId && (
          <button type="button" className="btn ghost" onClick={() => void run(call("/api/agenda/current", "PUT", { id: null }))}>
            清空目前段落
          </button>
        )}
      </form>
    </div>
  );
}
