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
