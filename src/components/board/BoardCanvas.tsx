"use client";

/**
 * 白板（Excalidraw）＋自架 websocket scene-sync。
 * - onChange 節流 100ms，只送 version 有變的元素（含 isDeleted 墓碑）
 * - 收到遠端元素 → reconcileElements 後 updateScene（記下版本避免回送）
 * - 斷線重連後重新 join，拿伺服器完整 scene 再合併，並補送本地未同步的變更
 */
import "@excalidraw/excalidraw/index.css";
import {
  CaptureUpdateAction,
  Excalidraw,
  convertToExcalidrawElements,
  exportToBlob,
  exportToSvg,
  reconcileElements,
} from "@excalidraw/excalidraw";
import type { ExcalidrawImperativeAPI, BinaryFileData } from "@excalidraw/excalidraw/types";
import type { OrderedExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import type { RemoteExcalidrawElement } from "@excalidraw/excalidraw/data/reconcile";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useWs } from "@/components/ws";
import { MAX_IMAGE_BYTES, STICKY_COLORS, dataUrlBytes, unsynced } from "./sync";
import { downloadBlob, pngToA3Pdf, stamp, withHeader } from "./exporters";

type Files = Record<string, BinaryFileData>;
type Status = { kind: "loading" | "saved" | "saving" | "offline"; at?: string };
type Version = { id: string; name: string; createdAt: string; createdBy: string | null };

const fmt = (iso?: string | Date) =>
  iso ? new Intl.DateTimeFormat("zh-TW", { hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso)) : "";

const UI_OPTIONS = {
  canvasActions: {
    changeViewBackgroundColor: false,
    clearCanvas: false,
    export: false as const,
    loadScene: false,
    saveToActiveFile: false,
    saveAsImage: false,
    toggleTheme: false,
  },
  tools: { image: true },
};

export default function BoardCanvas({
  boardId,
  groupName,
  backHref,
}: {
  boardId: string;
  groupName: string;
  backHref: string;
}) {
  const ws = useWs();
  const apiRef = useRef<ExcalidrawImperativeAPI | null>(null);
  const synced = useRef(new Map<string, number>());
  const sentFiles = useRef(new Set<string>());
  const flushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [initial, setInitial] = useState<{ elements: OrderedExcalidrawElement[]; files: Files } | null>(null);
  const [status, setStatus] = useState<Status>({ kind: "loading" });
  const [presence, setPresence] = useState<{ count: number; names: string[] }>({ count: 0, names: [] });
  const [theme, setTheme] = useState<"light" | "dark">("dark");
  const [sticky, setSticky] = useState(0);
  const [toast, setToast] = useState("");
  const [panel, setPanel] = useState<null | "versions">(null);
  const [versions, setVersions] = useState<Version[]>([]);
  const [preview, setPreview] = useState<{ v: Version; svg: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const say = useCallback((t: string) => {
    setToast(t);
    setTimeout(() => setToast(""), 3500);
  }, []);

  useEffect(() => {
    const read = () => setTheme(document.documentElement.dataset.theme === "light" ? "light" : "dark");
    read();
    window.addEventListener("themechange", read);
    return () => window.removeEventListener("themechange", read);
  }, []);

  /** 把本地未同步的元素與新圖片送出 */
  const flush = useCallback(() => {
    flushTimer.current = null;
    const api = apiRef.current;
    if (!api) return;
    const changed = unsynced(api.getSceneElementsIncludingDeleted(), synced.current);
    if (changed.length) {
      if (ws.send({ type: "update", boardId, elements: changed })) {
        for (const e of changed) synced.current.set(e.id, e.version);
        setStatus({ kind: "saving" });
      } else setStatus({ kind: "offline" });
    }
    const files = api.getFiles();
    const fresh: Files = {};
    const tooBig: string[] = [];
    for (const [id, f] of Object.entries(files)) {
      if (sentFiles.current.has(id)) continue;
      if (dataUrlBytes(f.dataURL) > MAX_IMAGE_BYTES) tooBig.push(id);
      else fresh[id] = f;
    }
    if (tooBig.length) {
      for (const id of tooBig) sentFiles.current.add(id);
      // 超過 2MB 的圖片不同步，直接從畫面移除
      const els = api.getSceneElementsIncludingDeleted().filter((e) => !("fileId" in e && e.fileId && tooBig.includes(e.fileId)));
      api.updateScene({ elements: els, captureUpdate: CaptureUpdateAction.NEVER });
      say("圖片超過 2MB，請縮小後再貼上");
    }
    if (Object.keys(fresh).length && ws.send({ type: "files", boardId, files: fresh })) {
      for (const id of Object.keys(fresh)) sentFiles.current.add(id);
    }
  }, [boardId, ws, say]);

  const schedule = useCallback(() => {
    if (!flushTimer.current) flushTimer.current = setTimeout(flush, 100);
  }, [flush]);

  /** 合併遠端元素 */
  const applyRemote = useCallback((remote: OrderedExcalidrawElement[]) => {
    const api = apiRef.current;
    if (!api) return;
    for (const e of remote) synced.current.set(e.id, e.version);
    const merged = reconcileElements(
      api.getSceneElementsIncludingDeleted(),
      remote as unknown as RemoteExcalidrawElement[],
      api.getAppState(),
    );
    api.updateScene({ elements: merged, captureUpdate: CaptureUpdateAction.NEVER });
  }, []);

  useEffect(() => {
    const offs = [
      ws.on("scene", (m) => {
        if (m.boardId !== boardId) return;
        const elements = m.elements as OrderedExcalidrawElement[];
        const files = (m.files ?? {}) as Files;
        for (const id of Object.keys(files)) sentFiles.current.add(id);
        setStatus({ kind: "saved", at: fmt(m.updatedAt as string) });
        if (!apiRef.current) {
          for (const e of elements) synced.current.set(e.id, e.version);
          setInitial((cur) => cur ?? { elements, files });
          return;
        }
        // 重新連線：補檔案、合併、補送本地變更
        apiRef.current.addFiles(Object.values(files));
        applyRemote(elements);
        schedule();
      }),
      ws.on("update", (m) => {
        if (m.boardId !== boardId) return;
        applyRemote(m.elements as OrderedExcalidrawElement[]);
        setStatus({ kind: "saved", at: fmt(m.updatedAt as string) });
      }),
      ws.on("files", (m) => {
        if (m.boardId !== boardId) return;
        const files = m.files as Files;
        for (const id of Object.keys(files)) sentFiles.current.add(id);
        apiRef.current?.addFiles(Object.values(files));
      }),
      ws.on("ack", (m) => {
        if (m.boardId === boardId) setStatus({ kind: "saved", at: fmt(m.updatedAt as string) });
      }),
      ws.on("presence", (m) => {
        if (m.boardId === boardId) setPresence({ count: m.count as number, names: m.names as string[] });
      }),
      ws.on("error", (m) => say(String(m.message ?? "同步錯誤"))),
      ws.onOpen(() => ws.send({ type: "join", boardId })),
    ];
    return () => {
      offs.forEach((off) => off());
      ws.send({ type: "leave", boardId });
    };
  }, [ws, boardId, applyRemote, schedule, say]);

  /** 便利貼：畫面中心插入彩色矩形，接著直接進入文字編輯（bound text） */
  const addSticky = () => {
    const api = apiRef.current;
    if (!api) return;
    const st = api.getAppState();
    const w = 220;
    const h = 160;
    const z = st.zoom.value;
    const x = -st.scrollX + st.width / 2 / z - w / 2 + (Math.random() * 40 - 20);
    const y = -st.scrollY + st.height / 2 / z - h / 2 + (Math.random() * 40 - 20);
    const [rect] = convertToExcalidrawElements([
      {
        type: "rectangle",
        x,
        y,
        width: w,
        height: h,
        backgroundColor: STICKY_COLORS[sticky].bg,
        fillStyle: "solid",
        strokeColor: "#b8a46a",
        strokeWidth: 1,
        roughness: 0,
        roundness: { type: 3 },
      },
    ]);
    api.updateScene({
      elements: [...api.getSceneElementsIncludingDeleted(), rect],
      appState: { selectedElementIds: { [rect.id]: true } },
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    });
    // 選取容器後按 Enter = Excalidraw 內建「在容器內新增文字」
    requestAnimationFrame(() => {
      const el = document.querySelector(".board-canvas .excalidraw") ?? document;
      el.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", code: "Enter", bubbles: true }));
    });
  };

  const exportPng = async (withTitle: boolean) => {
    const api = apiRef.current;
    if (!api) return null;
    const elements = api.getSceneElements();
    if (!elements.length) {
      say("白板是空的");
      return null;
    }
    const png = await exportToBlob({
      elements,
      files: api.getFiles(),
      mimeType: "image/png",
      exportPadding: 32,
      appState: { ...api.getAppState(), exportBackground: true, viewBackgroundColor: "#ffffff", exportWithDarkMode: false },
      getDimensions: (width: number, height: number) => ({ width: width * 2, height: height * 2, scale: 2 }),
    });
    return withTitle ? withHeader(png, `${groupName} 白板｜${stamp()}`) : png;
  };

  const onExport = async (kind: "png" | "pdf") => {
    setBusy(true);
    try {
      const png = await exportPng(kind === "pdf");
      if (!png) return;
      const base = `${groupName}白板_${stamp().replace(/[: ]/g, "-")}`;
      if (kind === "png") downloadBlob(png, `${base}.png`);
      else downloadBlob(await pngToA3Pdf(png, `${groupName} 白板`), `${base}.pdf`);
    } catch (e) {
      console.error(e);
      say("匯出失敗");
    } finally {
      setBusy(false);
    }
  };

  const loadVersions = useCallback(async () => {
    const r = await fetch(`/api/boards/${boardId}/versions`);
    if (r.ok) setVersions((await r.json()).versions);
  }, [boardId]);

  const saveVersion = async () => {
    flush();
    const name = prompt("版本名稱（留白＝目前段落名稱＋時刻）", "");
    if (name === null) return;
    setBusy(true);
    // 給 ws 一點時間把最後的變更送到伺服器
    await new Promise((r) => setTimeout(r, 300));
    const r = await fetch(`/api/boards/${boardId}/versions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(name.trim() ? { name: name.trim() } : {}),
    });
    setBusy(false);
    if (r.ok) {
      say(`已存成版本：${(await r.json()).name}`);
      if (panel === "versions") void loadVersions();
    } else say("存版本失敗");
  };

  const showPreview = async (v: Version) => {
    const r = await fetch(`/api/boards/${boardId}/versions/${v.id}`);
    if (!r.ok) return say("讀取版本失敗");
    const d = await r.json();
    if (!d.elements.length) return setPreview({ v, svg: "" });
    const svg = await exportToSvg({
      elements: d.elements,
      files: d.files,
      appState: { exportBackground: true, viewBackgroundColor: "#ffffff", exportWithDarkMode: false },
      exportPadding: 16,
    });
    svg.removeAttribute("width");
    svg.removeAttribute("height");
    setPreview({ v, svg: svg.outerHTML });
  };

  const restore = async (v: Version) => {
    if (!confirm(`確定還原到「${v.name}」？\n還原前會自動把目前狀態再存一版。`)) return;
    flush();
    await new Promise((r) => setTimeout(r, 300));
    const r = await fetch(`/api/boards/${boardId}/versions/${v.id}/restore`, { method: "POST" });
    if (r.ok) {
      say("已還原");
      setPreview(null);
      void loadVersions();
    } else say("還原失敗");
  };

  const kind = ws.status === "closed" ? "offline" : status.kind;
  const statusText =
    kind === "loading"
      ? "載入中…"
      : kind === "offline"
        ? "離線，重新連線中…"
        : kind === "saving"
          ? "儲存中…"
          : `已儲存${status.at ? ` · ${status.at}` : ""}`;

  return (
    <div className="board-page">
      <header className="board-top">
        <Link className="btn sm" href={backHref}>
          返回
        </Link>
        <strong className="board-title">{groupName} 白板</strong>
        <span className="badge" title={presence.names.join("、")}>
          <span className={`dot ${presence.count ? "on" : ""}`} style={{ marginRight: 6 }} />
          線上 {presence.count}
        </span>
        <div className="spacer" />
        <div className="sticky-group" role="group" aria-label="便利貼">
          <button className="btn sm primary" onClick={addSticky} disabled={!initial}>
            便利貼
          </button>
          {STICKY_COLORS.map((c, i) => (
            <button
              key={c.key}
              className={`swatch ${i === sticky ? "on" : ""}`}
              style={{ background: c.bg }}
              onClick={() => setSticky(i)}
              aria-label={`便利貼顏色：${c.label}`}
              title={c.label}
            />
          ))}
        </div>
        <button className="btn sm" onClick={saveVersion} disabled={busy || !initial}>
          存成版本
        </button>
        <button
          className="btn sm"
          onClick={() => {
            setPanel(panel ? null : "versions");
            if (!panel) void loadVersions();
          }}
        >
          版本
        </button>
        <button className="btn sm" onClick={() => onExport("png")} disabled={busy || !initial}>
          匯出 PNG
        </button>
        <button className="btn sm" onClick={() => onExport("pdf")} disabled={busy || !initial}>
          匯出 PDF
        </button>
        <span className={`save-status ${kind}`}>{statusText}</span>
      </header>

      <div className="board-canvas">
        {initial ? (
          <Excalidraw
            excalidrawAPI={(api) => (apiRef.current = api)}
            initialData={{ elements: initial.elements, files: initial.files, appState: { viewBackgroundColor: "#ffffff" }, scrollToContent: true }}
            onChange={schedule}
            theme={theme}
            langCode="zh-TW"
            UIOptions={UI_OPTIONS}
            renderTopRightUI={() => null}
            isCollaborating={false}
            name={`${groupName} 白板`}
          />
        ) : (
          <div className="board-loading">載入白板中…</div>
        )}

        {panel === "versions" && (
          <aside className="versions-panel">
            <div className="row">
              <h3 style={{ margin: 0 }}>版本</h3>
              <div className="spacer" />
              <button className="btn sm ghost" onClick={() => setPanel(null)}>
                關閉
              </button>
            </div>
            {versions.length === 0 ? <p className="muted small">還沒有版本。按「存成版本」建立第一版。</p> : null}
            <ul>
              {versions.map((v) => (
                <li key={v.id}>
                  <div>{v.name}</div>
                  <div className="muted small">
                    {fmt(v.createdAt)}
                    {v.createdBy ? ` · ${v.createdBy}` : ""}
                  </div>
                  <div className="row" style={{ gap: 6, marginTop: 4 }}>
                    <button className="btn sm" onClick={() => void showPreview(v)}>
                      預覽
                    </button>
                    <button className="btn sm" onClick={() => void restore(v)}>
                      還原
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </aside>
        )}

        {preview && (
          <div className="modal-back" onClick={() => setPreview(null)}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
              <div className="row">
                <h3 style={{ margin: 0 }}>預覽：{preview.v.name}</h3>
                <div className="spacer" />
                <button className="btn sm" onClick={() => void restore(preview.v)}>
                  還原這一版
                </button>
                <button className="btn sm ghost" onClick={() => setPreview(null)}>
                  關閉
                </button>
              </div>
              {preview.svg ? <div className="preview-svg" dangerouslySetInnerHTML={{ __html: preview.svg }} /> : <p className="muted">（空白）</p>}
            </div>
          </div>
        )}

        {toast && <div className="toast">{toast}</div>}
      </div>
    </div>
  );
}
