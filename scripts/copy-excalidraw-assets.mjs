// 把 Excalidraw 字型複製到 public/，讓白板不依賴外部 CDN（EXCALIDRAW_ASSET_PATH = "/"）
import { cpSync, existsSync } from "node:fs";
const src = "node_modules/@excalidraw/excalidraw/dist/prod/fonts";
if (existsSync(src)) {
  cpSync(src, "public/fonts", { recursive: true });
  console.log("excalidraw fonts → public/fonts");
}
