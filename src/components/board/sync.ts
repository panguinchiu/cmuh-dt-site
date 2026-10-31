/** 白板同步共用的小工具（純函式，方便測試） */
export interface SyncEl {
  id: string;
  version: number;
  versionNonce: number;
  isDeleted?: boolean;
}

/** 找出「伺服器還不知道的」元素：version 與已同步紀錄不同 */
export function unsynced<T extends SyncEl>(elements: readonly T[], synced: Map<string, number>): T[] {
  return elements.filter((e) => synced.get(e.id) !== e.version);
}

export const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

/** dataURL 換算原始位元組數 */
export function dataUrlBytes(dataURL: string) {
  const i = dataURL.indexOf(",");
  const b64 = i >= 0 ? dataURL.slice(i + 1) : dataURL;
  return Math.floor((b64.length * 3) / 4) - (b64.endsWith("==") ? 2 : b64.endsWith("=") ? 1 : 0);
}

export const STICKY_COLORS = [
  { key: "yellow", label: "黃", bg: "#ffe58a" },
  { key: "pink", label: "粉", bg: "#ffc9de" },
  { key: "green", label: "綠", bg: "#c3f0c8" },
  { key: "blue", label: "藍", bg: "#c5e3ff" },
] as const;

type Rect = { x: number; y: number; width: number; height: number; isDeleted?: boolean };

/** 在畫面中心附近找一個不和既有元素重疊的位置（由中心往外一圈圈找） */
export function freeSpot(elements: readonly Rect[], cx: number, cy: number, w: number, h: number, gap = 24) {
  const hits = (x: number, y: number) =>
    elements.some((e) => !e.isDeleted && x < e.x + Math.abs(e.width) + gap && x + w + gap > e.x && y < e.y + Math.abs(e.height) + gap && y + h + gap > e.y);
  const sx = w + gap;
  const sy = h + gap;
  for (let ring = 0; ring <= 6; ring++) {
    for (let dy = -ring; dy <= ring; dy++) {
      for (let dx = -ring; dx <= ring; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== ring) continue;
        const x = cx - w / 2 + dx * sx;
        const y = cy - h / 2 + dy * sy;
        if (!hits(x, y)) return { x, y };
      }
    }
  }
  return { x: cx - w / 2 + 30, y: cy - h / 2 + 30 };
}
