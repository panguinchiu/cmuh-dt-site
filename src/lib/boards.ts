/**
 * 白板版本＝可排序的「頁」。
 * - 排序第一（置頂）的版本＝白板畫面上正在共編的版本（board.activeVersionId），其最新內容在 ws hub／board.scene
 * - 其他版本的內容存在 BoardVersion.scene/files
 * - 把別的版本拖到最上面＝先把畫面內容存回原本置頂的版本，再把新置頂版本載入畫面
 */
import { randomBytes } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "./db";
import { canEditBoard, requireUser, type SessionUser } from "./authz";
import { HttpError, forbidden, notFound } from "./http";
import { broadcast, hub } from "./hub";

export const uuid = z.string().uuid();

/** 每組白板預設的課程段落版本 */
export const SEGMENT_PAGES = ["定義問題", "發想與收斂", "第一個未來解方", "修正原型"];

type Scene = { elements: unknown[]; files: Record<string, unknown> };
type El = { id: string; isDeleted?: boolean; fileId?: string; [k: string]: unknown };

/** 取白板並驗權：不存在 404、別組 403 */
export async function boardForUser(user: SessionUser | null, id: string) {
  const me = requireUser(user);
  if (!uuid.safeParse(id).success) throw notFound();
  const board = await db.board.findUnique({ where: { id }, include: { group: true } });
  if (!board) throw notFound();
  if (!canEditBoard(me, board)) throw forbidden();
  return { me, board };
}

/** 白板畫面上的最新內容：優先拿 ws hub 記憶體中的（可能還沒 flush），否則讀 DB */
export async function currentScene(boardId: string): Promise<Scene> {
  const live = await hub()?.snapshotBoard(boardId);
  if (live) return live;
  const b = await db.board.findUniqueOrThrow({ where: { id: boardId } });
  return { elements: b.scene as unknown[], files: b.files as Record<string, unknown> };
}

/** 只保留未刪除元素＋被引用的圖片 */
export function compact(scene: Scene): Scene {
  const elements = (scene.elements as El[]).filter((e) => !e.isDeleted);
  const used = new Set(elements.map((e) => e.fileId).filter(Boolean) as string[]);
  const files = Object.fromEntries(Object.entries(scene.files ?? {}).filter(([id]) => used.has(id)));
  return { elements, files };
}

const json = (v: unknown) => v as Prisma.InputJsonValue;
const newId = () => randomBytes(15).toString("base64url");

/** 複製元素時換新 id（含群組、文字容器、箭頭綁定、frame），避免與目標頁的元素衝突 */
export function remapIds(elements: El[]): El[] {
  const ids = new Map<string, string>();
  const groups = new Map<string, string>();
  const idOf = (id: string) => ids.get(id) ?? id;
  for (const e of elements) ids.set(e.id, newId());
  return elements.map((e) => {
    const out: El = { ...e, id: idOf(e.id), version: 1, versionNonce: Math.floor(Math.random() * 2 ** 31), index: null, updated: Date.now() };
    if (Array.isArray(e.groupIds))
      out.groupIds = (e.groupIds as string[]).map((g) => {
        if (!groups.has(g)) groups.set(g, newId());
        return groups.get(g)!;
      });
    if (typeof e.containerId === "string") out.containerId = idOf(e.containerId);
    if (typeof e.frameId === "string") out.frameId = idOf(e.frameId);
    if (Array.isArray(e.boundElements)) out.boundElements = (e.boundElements as { id: string; type: string }[]).map((b) => ({ ...b, id: idOf(b.id) }));
    for (const k of ["startBinding", "endBinding"] as const) {
      const b = e[k] as { elementId?: string } | null | undefined;
      if (b?.elementId) out[k] = { ...b, elementId: idOf(b.elementId) };
    }
    return out;
  });
}

type Box = { minX: number; minY: number; maxX: number; maxY: number };
/** 未刪除元素的外框 */
export function bounds(elements: El[]): Box | null {
  let b: Box | null = null;
  for (const e of elements) {
    if (e.isDeleted || typeof e.x !== "number" || typeof e.y !== "number") continue;
    const w = Math.abs(Number(e.width) || 0);
    const h = Math.abs(Number(e.height) || 0);
    const x = e.x as number, y = e.y as number;
    b = b
      ? { minX: Math.min(b.minX, x), minY: Math.min(b.minY, y), maxX: Math.max(b.maxX, x + w), maxY: Math.max(b.maxY, y + h) }
      : { minX: x, minY: y, maxX: x + w, maxY: y + h };
  }
  return b;
}

/** 加入複製時，把來源內容整批移到目標既有內容的右側，避免疊在一起 */
export function placeBeside(target: El[], incoming: El[], gap = 120): El[] {
  const t = bounds(target);
  const s = bounds(incoming);
  if (!t || !s) return incoming;
  const dx = t.maxX + gap - s.minX;
  const dy = t.minY - s.minY;
  return incoming.map((e) => (typeof e.x === "number" && typeof e.y === "number" ? { ...e, x: (e.x as number) + dx, y: (e.y as number) + dy } : e));
}

// 同一塊板的頁操作依序執行（單一 instance）
const locks = new Map<string, Promise<unknown>>();
function withLock<T>(boardId: string, fn: () => Promise<T>): Promise<T> {
  const prev = locks.get(boardId) ?? Promise.resolve();
  const next = prev.then(fn);
  // 鎖鏈上只放「不會 reject」的版本，錯誤只交給呼叫端處理
  const tail: Promise<void> = next.then(
    () => {},
    () => {},
  );
  locks.set(boardId, tail);
  void tail.then(() => locks.get(boardId) === tail && locks.delete(boardId));
  return next;
}

const notifyVersions = (boardId: string) => broadcast({ type: "board:versions", boardId });

async function ordered(boardId: string) {
  return db.boardVersion.findMany({ where: { boardId }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] });
}

async function renumber(boardId: string, ids: string[]) {
  await db.$transaction(ids.map((id, i) => db.boardVersion.update({ where: { id }, data: { sortOrder: i } })));
}

/** 把內容放上白板畫面（有 hub 就即時推給在線者，否則直接寫 DB） */
async function putOnCanvas(boardId: string, scene: Scene, userId: string | null) {
  const h = hub();
  if (h) return h.replaceBoard(boardId, scene.elements, scene.files);
  const cur = await db.board.findUniqueOrThrow({ where: { id: boardId } });
  await db.board.update({
    where: { id: boardId },
    data: { scene: json(scene.elements), files: json({ ...(cur.files as object), ...scene.files }), updatedAt: new Date(), updatedById: userId },
  });
}

async function appendOnCanvas(boardId: string, scene: Scene, userId: string | null) {
  const h = hub();
  if (h) return h.appendToBoard(boardId, scene.elements, scene.files);
  const cur = await db.board.findUniqueOrThrow({ where: { id: boardId } });
  await db.board.update({
    where: { id: boardId },
    data: {
      scene: json([...(cur.scene as unknown[]), ...scene.elements]),
      files: json({ ...(cur.files as object), ...scene.files }),
      updatedAt: new Date(),
      updatedById: userId,
    },
  });
}

/**
 * 第一次使用時，替白板建立各課程段落的版本（idempotent；之後刪掉的段落版本不會再被補回，也不打亂既有排序）。
 * 畫面上的現有內容歸到第一個段落版本並設為置頂。
 */
export async function ensureSegmentPages(boardId: string) {
  return withLock(boardId, async () => {
    const board = await db.board.findUniqueOrThrow({ where: { id: boardId } });
    let list = await ordered(boardId);
    if (board.activeVersionId && list.some((v) => v.id === board.activeVersionId)) return;
    const missing = SEGMENT_PAGES.filter((n) => !list.some((v) => v.name === n));
    for (const name of missing) {
      await db.boardVersion.create({ data: { boardId, name, scene: [], files: {}, sortOrder: -1 } });
    }
    list = await ordered(boardId);
    let active = list.find((v) => v.id === board.activeVersionId);
    if (!active) {
      active = list.find((v) => v.name === SEGMENT_PAGES[0]) ?? list[0];
      await db.board.update({ where: { id: boardId }, data: { activeVersionId: active.id } });
    }
    if (missing.length) {
      // 段落版本依 SEGMENT_PAGES 順序排在前面（置頂的仍在最上面），其餘維持原順序
      const seg = SEGMENT_PAGES.map((n) => list.find((v) => v.name === n)!).filter(Boolean);
      const rest = list.filter((v) => !SEGMENT_PAGES.includes(v.name));
      const order = [active, ...seg.filter((v) => v.id !== active!.id), ...rest.filter((v) => v.id !== active!.id)];
      await renumber(boardId, order.map((v) => v.id));
    }
  });
}

export async function listVersions(boardId: string) {
  const [board, rows] = await Promise.all([db.board.findUniqueOrThrow({ where: { id: boardId } }), ordered(boardId)]);
  const users = await db.user.findMany({ where: { id: { in: rows.map((r) => r.createdById!).filter(Boolean) } }, select: { id: true, name: true } });
  const nameOf = new Map(users.map((u) => [u.id, u.name]));
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    createdAt: r.createdAt,
    createdBy: nameOf.get(r.createdById ?? "") ?? null,
    active: r.id === board.activeVersionId,
  }));
}

/** 版本內容：置頂版本取白板畫面上的即時內容 */
export async function versionContent(boardId: string, versionId: string): Promise<Scene & { name: string }> {
  const [board, v] = await Promise.all([db.board.findUniqueOrThrow({ where: { id: boardId } }), db.boardVersion.findFirst({ where: { id: versionId, boardId } })]);
  if (!v) throw notFound();
  if (board.activeVersionId === v.id) return { name: v.name, ...compact(await currentScene(boardId)) };
  return { name: v.name, elements: v.scene as unknown[], files: v.files as Record<string, unknown> };
}

/** 把畫面上的即時內容存回目前置頂的版本 */
async function saveActive(boardId: string) {
  const board = await db.board.findUniqueOrThrow({ where: { id: boardId } });
  if (!board.activeVersionId) return;
  const s = compact(await currentScene(boardId));
  await db.boardVersion.updateMany({ where: { id: board.activeVersionId, boardId }, data: { scene: json(s.elements), files: json(s.files) } });
}

/** 存成版本：複製畫面內容成新版本，放在置頂版本正下方 */
export async function createVersion(boardId: string, name: string, userId: string) {
  return withLock(boardId, async () => {
    const s = compact(await currentScene(boardId));
    const v = await db.boardVersion.create({ data: { boardId, name, scene: json(s.elements), files: json(s.files), createdById: userId } });
    const ids = (await ordered(boardId)).map((x) => x.id).filter((id) => id !== v.id);
    ids.splice(1, 0, v.id);
    await renumber(boardId, ids);
    notifyVersions(boardId);
    return v;
  });
}

/** 調整排序；第一個版本若改變，白板畫面切換成它 */
export async function reorderVersions(boardId: string, ids: string[], userId: string) {
  return withLock(boardId, async () => {
    const [board, list] = await Promise.all([db.board.findUniqueOrThrow({ where: { id: boardId } }), ordered(boardId)]);
    const known = new Set(list.map((v) => v.id));
    if (new Set(ids).size !== ids.length || ids.length !== known.size || !ids.every((id) => known.has(id))) {
      throw new HttpError(400, "排序清單必須包含全部版本且不重複");
    }
    if (ids[0] !== board.activeVersionId) {
      await saveActive(boardId);
      const top = list.find((v) => v.id === ids[0])!;
      await putOnCanvas(boardId, { elements: top.scene as unknown[], files: top.files as Record<string, unknown> }, userId);
      await db.board.update({ where: { id: boardId }, data: { activeVersionId: top.id } });
    }
    await renumber(boardId, ids);
    notifyVersions(boardId);
  });
}

/** 把來源版本的內容複製到目標版本：append＝加入（保留目標原有內容）、replace＝取代 */
export async function copyVersion(boardId: string, sourceId: string, targetId: string, mode: "append" | "replace", userId: string) {
  if (sourceId === targetId) throw new HttpError(400, "來源與目標不能相同");
  return withLock(boardId, async () => {
    const board = await db.board.findUniqueOrThrow({ where: { id: boardId } });
    const target = await db.boardVersion.findFirst({ where: { id: targetId, boardId } });
    if (!target) throw notFound();
    const src = await versionContent(boardId, sourceId);
    let elements = src.elements as El[];
    if (mode === "append") {
      const targetEls = (target.id === board.activeVersionId ? (await currentScene(boardId)).elements : target.scene) as El[];
      elements = placeBeside(targetEls, remapIds(elements));
    }
    const scene = { elements, files: src.files };
    if (target.id === board.activeVersionId) {
      if (mode === "append") await appendOnCanvas(boardId, scene, userId);
      else await putOnCanvas(boardId, scene, userId);
    } else {
      const base = mode === "append" ? { elements: [...(target.scene as unknown[]), ...elements], files: { ...(target.files as object), ...scene.files } } : scene;
      await db.boardVersion.update({ where: { id: target.id }, data: { scene: json(base.elements), files: json(base.files) } });
    }
    notifyVersions(boardId);
  });
}

export async function renameVersion(boardId: string, versionId: string, name: string) {
  const r = await db.boardVersion.updateMany({ where: { id: versionId, boardId }, data: { name } });
  if (!r.count) throw notFound();
  notifyVersions(boardId);
}

/** 刪除版本（置頂版本不能刪，請先把別的版本移到最上面） */
export async function deleteVersion(boardId: string, versionId: string) {
  return withLock(boardId, async () => {
    const board = await db.board.findUniqueOrThrow({ where: { id: boardId } });
    if (board.activeVersionId === versionId) throw new HttpError(400, "白板畫面上的版本不能刪除，請先把別的版本移到最上面");
    const r = await db.boardVersion.deleteMany({ where: { id: versionId, boardId } });
    if (!r.count) throw notFound();
    notifyVersions(boardId);
  });
}

export function clock(d = new Date()) {
  return new Intl.DateTimeFormat("zh-TW", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Taipei" }).format(d);
}
