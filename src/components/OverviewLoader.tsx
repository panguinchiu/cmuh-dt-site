"use client";

import dynamic from "next/dynamic";
import type { ComponentProps } from "react";
import type { Overview as OverviewType } from "./Overview";

if (typeof window !== "undefined") (window as { EXCALIDRAW_ASSET_PATH?: string }).EXCALIDRAW_ASSET_PATH = "/";

const Overview = dynamic(() => import("./Overview").then((m) => m.Overview), { ssr: false, loading: () => <p className="muted">載入中…</p> });

export function OverviewLoader(props: ComponentProps<typeof OverviewType>) {
  return <Overview {...props} />;
}
