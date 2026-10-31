import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "./db";
import { canEditBoard, requireUser, type SessionUser } from "./authz";
import { forbidden, notFound } from "./http";
import { hub } from "./hub";

export const uuid = z.string().uuid();

/** 取白板並驗權：不存在 404、別組 403 */
export async function boardForUser(user: SessionUser | null, id: string) {
  const me = requireUser(user);
  if (!uuid.safeParse(id).success) throw notFound();
  const board = await db.board.findUnique({ where: { id }, include: { group: true } });
  if (!board) throw notFound();
  if (!canEditBoard(me, board)) throw forbidden();
  return { me, board };
}

/** 最新 scene：優先拿 ws hub 記憶體中的（可能還沒 flush），否則讀 DB */
export async function currentScene(boardId: string) {
  const live = await hub()?.snapshotBoard(boardId);
  if (live) return live;
  const b = await db.board.findUniqueOrThrow({ where: { id: boardId } });
  return { elements: b.scene as unknown[], files: b.files as Record<string, unknown> };
}

/** 版本只保留未刪除元素＋被引用的圖片 */
export function compact(scene: { elements: unknown[]; files: Record<string, unknown> }) {
  const elements = (scene.elements as { isDeleted?: boolean; fileId?: string }[]).filter((e) => !e.isDeleted);
  const used = new Set(elements.map((e) => e.fileId).filter(Boolean) as string[]);
  const files = Object.fromEntries(Object.entries(scene.files).filter(([id]) => used.has(id)));
  return { elements, files };
}

export async function createVersion(boardId: string, name: string, userId: string) {
  const s = compact(await currentScene(boardId));
  return db.boardVersion.create({
    data: {
      boardId,
      name,
      scene: s.elements as Prisma.InputJsonValue,
      files: s.files as Prisma.InputJsonValue,
      createdById: userId,
    },
  });
}

export function clock(d = new Date()) {
  return new Intl.DateTimeFormat("zh-TW", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Taipei" }).format(d);
}

/** 還原：先自動備份目前狀態，再把版本內容推進 hub（無 hub 時直接寫 DB） */
export async function restoreVersion(boardId: string, versionId: string, userId: string) {
  const v = await db.boardVersion.findFirst({ where: { id: versionId, boardId } });
  if (!v) throw notFound();
  await createVersion(boardId, `還原前自動備份 · ${clock()}`, userId);
  const elements = v.scene as unknown[];
  const files = v.files as Record<string, unknown>;
  const h = hub();
  if (h) await h.replaceBoard(boardId, elements, files);
  else {
    const cur = await db.board.findUniqueOrThrow({ where: { id: boardId } });
    await db.board.update({
      where: { id: boardId },
      data: {
        scene: elements as Prisma.InputJsonValue,
        files: { ...(cur.files as object), ...files } as Prisma.InputJsonValue,
        updatedAt: new Date(),
        updatedById: userId,
      },
    });
  }
  return v;
}
