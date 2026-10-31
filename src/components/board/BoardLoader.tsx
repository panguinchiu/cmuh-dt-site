"use client";

import dynamic from "next/dynamic";
import { WsProvider } from "@/components/ws";

declare global {
  interface Window {
    EXCALIDRAW_ASSET_PATH?: string;
  }
}
// 必須在載入 Excalidraw 之前設定：字型由 public/fonts 自架，不連外部 CDN
if (typeof window !== "undefined") window.EXCALIDRAW_ASSET_PATH = "/";

const BoardCanvas = dynamic(() => import("./BoardCanvas"), {
  ssr: false,
  loading: () => <div className="board-loading">載入白板中…</div>,
});

export function BoardLoader(props: { boardId: string; groupName: string; backHref: string }) {
  return (
    <WsProvider>
      <BoardCanvas {...props} />
    </WsProvider>
  );
}
