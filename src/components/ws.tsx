"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";

type Msg = { type: string; [k: string]: unknown };
type Listener = (m: Msg) => void;

export interface WsApi {
  send(msg: object): boolean;
  /** 訂閱某種訊息；type="*" 收全部 */
  on(type: string, fn: Listener): () => void;
  /** 每次（重新）連線成功都會呼叫，用來重新 join */
  onOpen(fn: () => void): () => void;
  status: "connecting" | "open" | "closed";
}

const Ctx = createContext<WsApi | null>(null);

export function WsProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<WsApi["status"]>("connecting");
  const wsRef = useRef<WebSocket | null>(null);
  const listeners = useRef(new Map<string, Set<Listener>>());
  const openers = useRef(new Set<() => void>());

  useEffect(() => {
    let stopped = false;
    let attempt = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let ping: ReturnType<typeof setInterval> | undefined;

    const connect = () => {
      if (stopped) return;
      setStatus("connecting");
      const proto = location.protocol === "https:" ? "wss" : "ws";
      const ws = new WebSocket(`${proto}://${location.host}/ws`);
      wsRef.current = ws;
      ws.onopen = () => {
        attempt = 0;
        setStatus("open");
        openers.current.forEach((fn) => fn());
        ping = setInterval(() => ws.readyState === 1 && ws.send('{"type":"ping"}'), 25_000);
      };
      ws.onmessage = (ev) => {
        let m: Msg;
        try {
          m = JSON.parse(ev.data);
        } catch {
          return;
        }
        listeners.current.get(m.type)?.forEach((fn) => fn(m));
        listeners.current.get("*")?.forEach((fn) => fn(m));
      };
      ws.onclose = (ev) => {
        clearInterval(ping);
        setStatus("closed");
        if (stopped) return;
        if (ev.code === 4401) {
          location.href = "/login";
          return;
        }
        // 指數退避重連：1s, 2s, 4s ... 上限 15s
        const delay = Math.min(15_000, 1000 * 2 ** attempt++);
        timer = setTimeout(connect, delay);
      };
    };
    connect();
    return () => {
      stopped = true;
      clearTimeout(timer);
      clearInterval(ping);
      wsRef.current?.close();
    };
  }, []);

  const api = useMemo<WsApi>(
    () => ({
      status,
      send(msg) {
        const ws = wsRef.current;
        if (!ws || ws.readyState !== WebSocket.OPEN) return false;
        ws.send(JSON.stringify(msg));
        return true;
      },
      on(type, fn) {
        let set = listeners.current.get(type);
        if (!set) listeners.current.set(type, (set = new Set()));
        set.add(fn);
        return () => set!.delete(fn);
      },
      onOpen(fn) {
        openers.current.add(fn);
        if (wsRef.current?.readyState === WebSocket.OPEN) fn();
        return () => openers.current.delete(fn);
      },
    }),
    [status],
  );

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

export function useWs() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useWs 必須在 WsProvider 內使用");
  return v;
}

/** 收到某種廣播就執行 fn（例如 router.refresh） */
export function useWsEvent(type: string, fn: Listener) {
  const ws = useWs();
  const ref = useRef(fn);
  useEffect(() => {
    ref.current = fn;
  });
  useEffect(() => ws.on(type, (m) => ref.current(m)), [ws, type]);
}
