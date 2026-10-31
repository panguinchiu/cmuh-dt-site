"use client";

/**
 * 白板版本面板：可拖移排序，排第一（置頂）的版本＝白板畫面上的版本。
 * 拖移用 pointer events（平板觸控也能用），另有「移到最上面」按鈕。
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useWs } from "@/components/ws";

export type Version = { id: string; name: string; createdAt: string; createdBy: string | null; active: boolean };

type Props = {
  boardId: string;
  onClose: () => void;
  onPreview: (v: Version) => void;
  /** 送出前先把畫面上的變更送到伺服器 */
  beforeChange: () => Promise<void>;
  onActiveChange: (name: string | null) => void;
  say: (t: string) => void;
};

const fmt = (iso: string) => new Intl.DateTimeFormat("zh-TW", { hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso));

async function call(url: string, method: string, body?: unknown) {
  const r = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || "操作失敗");
  return d;
}

export function VersionsPanel({ boardId, onClose, onPreview, beforeChange, onActiveChange, say }: Props) {
  const ws = useWs();
  const [versions, setVersions] = useState<Version[]>([]);
  const [order, setOrder] = useState<string[]>([]);
  const [dragId, setDragId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copyFrom, setCopyFrom] = useState<Version | null>(null);
  const rows = useRef(new Map<string, HTMLLIElement>());

  const load = useCallback(async () => {
    const r = await fetch(`/api/boards/${boardId}/versions`, { cache: "no-store" });
    if (!r.ok) return;
    const v: Version[] = (await r.json()).versions;
    setVersions(v);
    setOrder(v.map((x) => x.id));
    onActiveChange(v.find((x) => x.active)?.name ?? null);
  }, [boardId, onActiveChange]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);
  useEffect(() => ws.on("board:versions", (m) => m.boardId === boardId && void load()), [ws, boardId, load]);

  const byId = new Map(versions.map((v) => [v.id, v]));
  const top = versions.find((v) => v.active);

  const commit = async (ids: string[]) => {
    const newTop = byId.get(ids[0]);
    if (newTop && !newTop.active) {
      const ok = confirm(`白板畫面會換成「${newTop.name}」，同組所有人會同時看到。\n目前畫面上的內容會保存在「${top?.name ?? "原版本"}」。`);
      if (!ok) return setOrder(versions.map((v) => v.id));
    }
    setBusy(true);
    try {
      await beforeChange();
      await call(`/api/boards/${boardId}/versions/order`, "PUT", { ids });
      if (newTop && !newTop.active) say(`白板畫面已換成「${newTop.name}」`);
    } catch (e) {
      say((e as Error).message);
    } finally {
      setBusy(false);
      await load();
    }
  };

  // ---- pointer 拖移 ----
  const onPointerDown = (e: React.PointerEvent, id: string) => {
    if (busy) return;
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    setDragId(id);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragId) return;
    const ids = order.filter((x) => x !== dragId);
    let idx = ids.length;
    for (let i = 0; i < ids.length; i++) {
      const r = rows.current.get(ids[i])?.getBoundingClientRect();
      if (r && e.clientY < r.top + r.height / 2) {
        idx = i;
        break;
      }
    }
    ids.splice(idx, 0, dragId);
    if (ids.join() !== order.join()) setOrder(ids);
  };
  const onPointerUp = () => {
    if (!dragId) return;
    setDragId(null);
    if (order.join() !== versions.map((v) => v.id).join()) void commit(order);
  };

  const moveTop = (v: Version) => void commit([v.id, ...order.filter((x) => x !== v.id)]);

  const rename = async (v: Version) => {
    const name = prompt("版本名稱", v.name)?.trim();
    if (!name || name === v.name) return;
    try {
      await call(`/api/boards/${boardId}/versions/${v.id}`, "PATCH", { name });
    } catch (e) {
      say((e as Error).message);
    }
    await load();
  };

  const remove = async (v: Version) => {
    if (!confirm(`確定刪除版本「${v.name}」？此動作無法復原。`)) return;
    try {
      await call(`/api/boards/${boardId}/versions/${v.id}`, "DELETE");
    } catch (e) {
      say((e as Error).message);
    }
    await load();
  };

  return (
    <aside className="versions-panel">
      <div className="row">
        <h3 style={{ margin: 0 }}>版本</h3>
        <div className="spacer" />
        <button className="btn sm ghost" onClick={onClose}>
          關閉
        </button>
      </div>
      <p className="muted small" style={{ margin: "6px 0 0" }}>
        按住左側「≡」上下拖移。<b>最上面的版本就是白板畫面上的內容</b>。
      </p>
      <ul onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}>
        {order.map((id, i) => {
          const v = byId.get(id);
          if (!v) return null;
          return (
            <li
              key={id}
              ref={(el) => {
                if (el) rows.current.set(id, el);
                else rows.current.delete(id);
              }}
              className={`version-item ${i === 0 ? "top" : ""} ${dragId === id ? "dragging" : ""}`}
            >
              <div className="row" style={{ flexWrap: "nowrap", alignItems: "flex-start" }}>
                <button className="drag-handle" aria-label={`拖移「${v.name}」`} onPointerDown={(e) => onPointerDown(e, id)} disabled={busy}>
                  ≡
                </button>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="version-name">{v.name}</div>
                  <div className="muted small">
                    {i === 0 ? <span className="badge accent">白板畫面</span> : null} {fmt(v.createdAt)}
                    {v.createdBy ? ` · ${v.createdBy}` : ""}
                  </div>
                </div>
              </div>
              <div className="row version-actions">
                {i !== 0 && (
                  <button className="btn sm primary" disabled={busy} onClick={() => moveTop(v)}>
                    移到最上面
                  </button>
                )}
                <button className="btn sm" onClick={() => onPreview(v)}>
                  預覽
                </button>
                <button className="btn sm" disabled={busy || versions.length < 2} onClick={() => setCopyFrom(v)}>
                  複製到…
                </button>
                <button className="btn sm ghost" onClick={() => void rename(v)}>
                  改名
                </button>
                {i !== 0 && (
                  <button className="btn sm danger" onClick={() => void remove(v)}>
                    刪除
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      {copyFrom && (
        <CopyDialog
          from={copyFrom}
          targets={order.map((id) => byId.get(id)!).filter((v) => v && v.id !== copyFrom.id)}
          onClose={() => setCopyFrom(null)}
          onCopy={async (targetId, mode) => {
            setBusy(true);
            try {
              await beforeChange();
              await call(`/api/boards/${boardId}/versions/${copyFrom.id}/copy`, "POST", { targetId, mode });
              say(`已把「${copyFrom.name}」${mode === "append" ? "加入" : "取代"}到「${byId.get(targetId)?.name}」`);
              setCopyFrom(null);
            } catch (e) {
              say((e as Error).message);
            } finally {
              setBusy(false);
              await load();
            }
          }}
        />
      )}
    </aside>
  );
}

function CopyDialog({
  from,
  targets,
  onClose,
  onCopy,
}: {
  from: Version;
  targets: Version[];
  onClose: () => void;
  onCopy: (targetId: string, mode: "append" | "replace") => Promise<void>;
}) {
  const [target, setTarget] = useState(targets[0]?.id ?? "");
  const [mode, setMode] = useState<"append" | "replace">("append");
  const t = targets.find((x) => x.id === target);
  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal" style={{ maxWidth: "calc(560px * var(--z))" }} onClick={(e) => e.stopPropagation()}>
        <h3>複製「{from.name}」的內容</h3>
        <label className="field">
          <span>複製到哪一個版本</span>
          <select className="input" value={target} onChange={(e) => setTarget(e.target.value)}>
            {targets.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
                {v.active ? "（白板畫面）" : ""}
              </option>
            ))}
          </select>
        </label>
        <div className="field">
          <label style={{ display: "block", cursor: "pointer" }}>
            <input type="radio" checked={mode === "append"} onChange={() => setMode("append")} /> 加入（保留「{t?.name}」原有內容）
          </label>
          <label style={{ display: "block", cursor: "pointer" }}>
            <input type="radio" checked={mode === "replace"} onChange={() => setMode("replace")} /> 取代（「{t?.name}」原有內容會被清掉）
          </label>
        </div>
        <div className="row">
          <button
            className={`btn ${mode === "replace" ? "danger" : "primary"}`}
            disabled={!target}
            onClick={() => {
              if (mode === "replace" && !confirm(`確定用「${from.name}」取代「${t?.name}」的內容？`)) return;
              void onCopy(target, mode);
            }}
          >
            複製
          </button>
          <button className="btn ghost" onClick={onClose}>
            取消
          </button>
        </div>
      </div>
    </div>
  );
}
