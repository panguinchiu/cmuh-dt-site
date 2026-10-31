/**
 * Route handler（Next bundle）與 custom server（ws）之間的橋。
 * server.ts 啟動時把實作掛到 globalThis.__dtHub；測試或未掛載時呼叫皆為 no-op。
 */
export interface Hub {
  broadcastAll(msg: object): void;
  /** 白板版本還原：替換記憶體中的 scene 並推給在線者 */
  replaceBoard(boardId: string, elements: unknown[], files: Record<string, unknown>): Promise<void>;
  /** 取得記憶體中最新 scene（尚未 flush 的也算） */
  snapshotBoard(boardId: string): Promise<{ elements: unknown[]; files: Record<string, unknown> } | null>;
}

const g = globalThis as unknown as { __dtHub?: Hub };

export function setHub(h: Hub) {
  g.__dtHub = h;
}

export function hub(): Hub | undefined {
  return g.__dtHub;
}

export function broadcast(msg: object) {
  g.__dtHub?.broadcastAll(msg);
}
