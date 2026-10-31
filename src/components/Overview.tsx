"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useWs, useWsEvent } from "./ws";

type BoardCard = { boardId: string; groupName: string };
type El = { id: string; version: number; isDeleted?: boolean };
type Item = { id: string; no: number; title: string };

const THUMB_MS = 10_000;
const fmt = (d?: string) => (d ? new Intl.DateTimeFormat("zh-TW", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).format(new Date(d)) : "—");

/**
 * 講師總覽：以 watch 模式訂閱 4 塊白板的 scene，client 端每 10 秒（有變動才）用 exportToSvg 產生縮圖。
 */
export function Overview({ boards, agenda }: { boards: BoardCard[]; agenda: { items: Item[]; currentId: string | null } }) {
  const ws = useWs();
  const scenes = useRef(new Map<string, { els: Map<string, El>; files: Record<string, unknown>; dirty: boolean }>());
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const [meta, setMeta] = useState<Record<string, { updatedAt?: string; online: number; names: string[] }>>({});
  const [current, setCurrent] = useState(agenda.currentId);
  const [items, setItems] = useState(agenda.items);
  const [err, setErr] = useState("");

  const scene = (id: string) => {
    let s = scenes.current.get(id);
    if (!s) scenes.current.set(id, (s = { els: new Map(), files: {}, dirty: true }));
    return s;
  };
  const touch = (id: string, updatedAt?: string) => setMeta((m) => ({ ...m, [id]: { ...(m[id] ?? { online: 0, names: [] }), ...(updatedAt ? { updatedAt } : {}) } }));

  useEffect(() => {
    const ids = new Set(boards.map((b) => b.boardId));
    const offs = [
      ws.on("scene", (m) => {
        const id = m.boardId as string;
        if (!ids.has(id)) return;
        const s = scene(id);
        s.els = new Map((m.elements as El[]).map((e) => [e.id, e]));
        s.files = (m.files as Record<string, unknown>) ?? {};
        s.dirty = true;
        touch(id, m.updatedAt as string);
      }),
      ws.on("update", (m) => {
        const id = m.boardId as string;
        if (!ids.has(id)) return;
        const s = scene(id);
        for (const e of m.elements as El[]) {
          const cur = s.els.get(e.id);
          if (!cur || cur.version <= e.version) s.els.set(e.id, e);
        }
        s.dirty = true;
        touch(id, m.updatedAt as string);
      }),
      ws.on("files", (m) => {
        const id = m.boardId as string;
        if (!ids.has(id)) return;
        Object.assign(scene(id).files, m.files);
        scene(id).dirty = true;
      }),
      ws.on("presence", (m) => {
        const id = m.boardId as string;
        if (!ids.has(id)) return;
        setMeta((x) => ({ ...x, [id]: { ...(x[id] ?? {}), online: m.count as number, names: m.names as string[] } }));
      }),
      ws.onOpen(() => boards.forEach((b) => ws.send({ type: "join", boardId: b.boardId, watch: true }))),
    ];
    return () => {
      offs.forEach((o) => o());
      boards.forEach((b) => ws.send({ type: "leave", boardId: b.boardId }));
    };
  }, [ws, boards]);

  // 縮圖：有變動才重畫，最快每 10 秒一次
  const render = useCallback(async () => {
    const dirty = [...scenes.current.entries()].filter(([, s]) => s.dirty);
    if (!dirty.length) return;
    const { exportToSvg } = await import("@excalidraw/excalidraw");
    const out: Record<string, string> = {};
    for (const [id, s] of dirty) {
      s.dirty = false;
      const elements = [...s.els.values()].filter((e) => !e.isDeleted);
      if (!elements.length) {
        out[id] = "";
        continue;
      }
      try {
        const svg = await exportToSvg({
          elements: elements as never,
          files: s.files as never,
          appState: { exportBackground: true, viewBackgroundColor: "#ffffff", exportWithDarkMode: false },
          exportPadding: 12,
          skipInliningFonts: true,
        });
        svg.removeAttribute("width");
        svg.removeAttribute("height");
        svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
        out[id] = svg.outerHTML;
      } catch (e) {
        console.error("thumbnail", e);
      }
    }
    setThumbs((t) => ({ ...t, ...out }));
  }, []);

  useEffect(() => {
    const first = setTimeout(() => void render(), 800);
    const t = setInterval(() => void render(), THUMB_MS);
    return () => (clearTimeout(first), clearInterval(t));
  }, [render]);

  const refreshAgenda = useCallback(async () => {
    const r = await fetch("/api/agenda");
    if (r.ok) {
      const d = await r.json();
      setItems(d.items);
      setCurrent(d.currentId);
    }
  }, []);
  useWsEvent("agenda:current", () => void refreshAgenda());
  useWsEvent("agenda:update", () => void refreshAgenda());

  const setCur = async (id: string | null) => {
    setErr("");
    const r = await fetch("/api/agenda/current", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
    if (!r.ok) setErr((await r.json().catch(() => ({}))).error || "切換失敗");
    else setCurrent((await r.json()).currentId);
  };

  return (
    <>
      <section className="card">
        <div className="row" style={{ marginBottom: "calc(10px * var(--z))" }}>
          <h3 style={{ margin: 0 }}>目前段落</h3>
          <span className="muted small">點一下即切換，所有人首頁即時更新</span>
          <div className="spacer" />
          <Link className="small" href="/admin#agenda">
            編輯議程
          </Link>
        </div>
        {err && <div className="notice err">{err}</div>}
        <div className="agenda-switch">
          {items.map((i) => (
            <button key={i.id} className={`btn sm ${i.id === current ? "primary" : ""}`} onClick={() => void setCur(i.id)} aria-pressed={i.id === current}>
              <span className="mono">{String(i.no).padStart(2, "0")}</span> {i.title}
            </button>
          ))}
        </div>
      </section>

      <div className="grid boards-grid">
        {boards.map((b) => {
          const m = meta[b.boardId];
          return (
            <Link key={b.boardId} href={`/board/${b.boardId}`} className="card board-card">
              <div className="row" style={{ marginBottom: "calc(10px * var(--z))" }}>
                <h3 style={{ margin: 0, color: "var(--text)" }}>{b.groupName}</h3>
                <span className="badge" title={m?.names?.join("、")}>
                  <span className={`dot ${m?.online ? "on" : ""}`} style={{ marginRight: "calc(6px * var(--z))" }} />
                  線上 {m?.online ?? 0}
                </span>
                <div className="spacer" />
                <span className="muted small mono">更新 {fmt(m?.updatedAt)}</span>
              </div>
              <div className="thumb">
                {thumbs[b.boardId] ? <div style={{ width: "100%", height: "100%" }} dangerouslySetInnerHTML={{ __html: thumbs[b.boardId] }} /> : <span className="muted small">（空白）</span>}
              </div>
            </Link>
          );
        })}
      </div>
    </>
  );
}
