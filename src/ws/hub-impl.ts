/**
 * WebSocket hub：白板 scene-sync（自架、不用 Yjs）＋ agenda/game 廣播。
 * - 記憶體中每塊板維護 Map<id, element>，以 version（大者勝；相同則 versionNonce 小者勝）合併
 * - dirty 板每 30 秒 flush 到 Postgres；最後一人離線、SIGTERM 時立即 flush
 * - 每個 join/update/files 訊息都重驗 canEditBoard；未授權直接關閉連線
 */
import type { IncomingMessage } from "node:http";
import type { Duplex } from "node:stream";
import { WebSocketServer, type WebSocket } from "ws";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { canEditBoard, type SessionUser } from "@/lib/authz";
import { parseCookie, SESSION_COOKIE, userFromToken } from "@/lib/session";
import type { Hub } from "@/lib/hub";

type El = { id: string; version: number; versionNonce: number; isDeleted?: boolean; [k: string]: unknown };
type FileMap = Record<string, { id: string; dataURL: string; mimeType: string; created?: number; [k: string]: unknown }>;

interface Client {
  ws: WebSocket;
  token: string;
  user: SessionUser;
  boards: Map<string, "edit" | "watch">;
  alive: boolean;
  lastAuth: number;
}

interface BoardState {
  id: string;
  groupId: string;
  elements: Map<string, El>;
  files: FileMap;
  dirty: boolean;
  updatedAt: Date;
  updatedById: string | null;
}

const FLUSH_MS = 30_000;
const REAUTH_MS = 60_000;
const MAX_FILE_DATAURL = Math.ceil((2 * 1024 * 1024 * 4) / 3) + 200; // 2MB 原檔的 base64
const MAX_ELEMENTS = 20_000;

const elSchema = z
  .object({ id: z.string().min(1).max(100), version: z.number().int().nonnegative(), versionNonce: z.number().int() })
  .passthrough();
const fileSchema = z
  .object({ id: z.string().min(1).max(100), dataURL: z.string().max(MAX_FILE_DATAURL).startsWith("data:image/"), mimeType: z.string().max(100) })
  .passthrough();

const msgSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("join"), boardId: z.string().uuid(), watch: z.boolean().optional() }),
  z.object({ type: z.literal("leave"), boardId: z.string().uuid() }),
  z.object({ type: z.literal("update"), boardId: z.string().uuid(), elements: z.array(elSchema).max(MAX_ELEMENTS) }),
  z.object({ type: z.literal("files"), boardId: z.string().uuid(), files: z.record(z.string(), fileSchema) }),
  z.object({ type: z.literal("ping") }),
]);

/** a 是否應取代 b */
export function wins(a: El, b: El | undefined) {
  if (!b) return true;
  if (a.version !== b.version) return a.version > b.version;
  return a.versionNonce < b.versionNonce;
}

export function createHub() {
  const clients = new Set<Client>();
  const boards = new Map<string, BoardState>();
  const loading = new Map<string, Promise<BoardState | null>>();
  const wss = new WebSocketServer({ noServer: true, maxPayload: 12 * 1024 * 1024 });

  const send = (ws: WebSocket, msg: object) => {
    if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
  };

  function loadBoard(id: string): Promise<BoardState | null> {
    const b = boards.get(id);
    if (b) return Promise.resolve(b);
    let p = loading.get(id);
    if (!p) {
      p = db.board
        .findUnique({ where: { id } })
        .then((row) => {
          if (!row) return null;
          const elements = new Map<string, El>();
          for (const e of (row.scene as unknown as El[]) ?? []) elements.set(e.id, e);
          const st: BoardState = {
            id,
            groupId: row.groupId,
            elements,
            files: (row.files as unknown as FileMap) ?? {},
            dirty: false,
            updatedAt: row.updatedAt,
            updatedById: row.updatedById,
          };
          boards.set(id, st);
          return st;
        })
        .finally(() => loading.delete(id));
      loading.set(id, p);
    }
    return p;
  }

  async function flush(b: BoardState) {
    if (!b.dirty) return;
    b.dirty = false;
    try {
      await db.board.update({
        where: { id: b.id },
        data: {
          scene: Array.from(b.elements.values()) as unknown as Prisma.InputJsonValue,
          files: b.files as unknown as Prisma.InputJsonValue,
          updatedAt: b.updatedAt,
          updatedById: b.updatedById,
        },
      });
    } catch (e) {
      b.dirty = true;
      console.error("[hub] flush failed", b.id, e);
    }
  }

  const flushAll = () => Promise.all(Array.from(boards.values()).map(flush));
  const timer = setInterval(() => void flushAll(), FLUSH_MS);
  timer.unref();

  const editorsOf = (boardId: string) => Array.from(clients).filter((c) => c.boards.get(boardId) === "edit");
  const membersOf = (boardId: string) => Array.from(clients).filter((c) => c.boards.has(boardId));

  function presence(boardId: string) {
    const editors = editorsOf(boardId);
    const names = Array.from(new Set(editors.map((c) => c.user.name)));
    const msg = { type: "presence", boardId, count: names.length, names };
    for (const c of membersOf(boardId)) send(c.ws, msg);
    // 總覽頁顯示線上人數
    for (const c of clients) if (c.user.role === "instructor" && !c.boards.has(boardId)) send(c.ws, msg);
  }

  async function leave(c: Client, boardId: string) {
    if (!c.boards.delete(boardId)) return;
    presence(boardId);
    if (membersOf(boardId).length === 0) {
      const b = boards.get(boardId);
      if (b) await flush(b);
    }
  }

  async function revalidate(c: Client) {
    if (Date.now() - c.lastAuth < REAUTH_MS) return true;
    const u = await userFromToken(c.token);
    if (!u) return false;
    c.user = u;
    c.lastAuth = Date.now();
    return true;
  }

  async function onMessage(c: Client, raw: string) {
    let data: unknown;
    try {
      data = JSON.parse(raw);
    } catch {
      return send(c.ws, { type: "error", message: "格式錯誤" });
    }
    const parsed = msgSchema.safeParse(data);
    if (!parsed.success) return send(c.ws, { type: "error", message: "格式錯誤" });
    const msg = parsed.data;
    if (msg.type === "ping") return send(c.ws, { type: "pong" });

    if (!(await revalidate(c))) return c.ws.close(4401, "unauthorized");

    if (msg.type === "leave") return leave(c, msg.boardId);

    const b = await loadBoard(msg.boardId);
    if (!b || !canEditBoard(c.user, b)) {
      // 未授權直接關閉連線
      return c.ws.close(4403, "forbidden");
    }

    if (msg.type === "join") {
      if (msg.watch && c.user.role !== "instructor") return c.ws.close(4403, "forbidden");
      c.boards.set(b.id, msg.watch ? "watch" : "edit");
      send(c.ws, {
        type: "scene",
        boardId: b.id,
        elements: Array.from(b.elements.values()),
        files: b.files,
        updatedAt: b.updatedAt,
      });
      presence(b.id);
      return;
    }

    if (c.boards.get(b.id) !== "edit") return send(c.ws, { type: "error", message: "尚未加入白板" });

    if (msg.type === "update") {
      const accepted: El[] = [];
      for (const e of msg.elements as El[]) {
        if (wins(e, b.elements.get(e.id))) {
          b.elements.set(e.id, e);
          accepted.push(e);
        }
      }
      if (b.elements.size > MAX_ELEMENTS) return send(c.ws, { type: "error", message: "白板物件過多" });
      if (!accepted.length) return;
      b.dirty = true;
      b.updatedAt = new Date();
      b.updatedById = c.user.id;
      const out = { type: "update", boardId: b.id, elements: accepted, updatedAt: b.updatedAt };
      for (const o of membersOf(b.id)) if (o !== c) send(o.ws, out);
      send(c.ws, { type: "ack", boardId: b.id, updatedAt: b.updatedAt });
      return;
    }

    if (msg.type === "files") {
      const fresh: FileMap = {};
      for (const [id, f] of Object.entries(msg.files)) {
        if (!b.files[id]) fresh[id] = f as FileMap[string];
      }
      if (!Object.keys(fresh).length) return;
      Object.assign(b.files, fresh);
      b.dirty = true;
      b.updatedAt = new Date();
      for (const o of membersOf(b.id)) if (o !== c) send(o.ws, { type: "files", boardId: b.id, files: fresh });
      return;
    }
  }

  async function handleUpgrade(req: IncomingMessage, socket: Duplex, head: Buffer) {
    const token = parseCookie(req.headers.cookie, SESSION_COOKIE);
    const user = await userFromToken(token).catch(() => null);
    const origin = req.headers.origin;
    const host = req.headers.host;
    // 擋跨站 websocket（CSWSH）：Origin 必須與 Host 相同
    const originOk = !origin || (host && new URL(origin).host === host);
    if (!user || !token || !originOk) {
      socket.write("HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n");
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      const c: Client = { ws, token, user, boards: new Map(), alive: true, lastAuth: Date.now() };
      clients.add(c);
      send(ws, { type: "hello", user: { id: user.id, name: user.name, role: user.role, groupId: user.groupId } });
      ws.on("pong", () => (c.alive = true));
      ws.on("message", (d) => void onMessage(c, d.toString()).catch((e) => console.error("[hub] message", e)));
      ws.on("close", () => {
        clients.delete(c);
        for (const id of Array.from(c.boards.keys())) void leave(c, id);
      });
    });
  }

  const heartbeat = setInterval(() => {
    for (const c of clients) {
      if (!c.alive) {
        c.ws.terminate();
        continue;
      }
      c.alive = false;
      c.ws.ping();
    }
  }, 30_000);
  heartbeat.unref();

  const api: Hub = {
    broadcastAll(msg) {
      const s = JSON.stringify(msg);
      for (const c of clients) if (c.ws.readyState === c.ws.OPEN) c.ws.send(s);
    },
    async snapshotBoard(boardId) {
      const b = await loadBoard(boardId);
      if (!b) return null;
      return { elements: Array.from(b.elements.values()), files: { ...b.files } };
    },
    async replaceBoard(boardId, elements, files) {
      const b = await loadBoard(boardId);
      if (!b) return;
      const incoming = new Map((elements as El[]).map((e) => [e.id, e]));
      const changed: El[] = [];
      // 還原的元素版本必須高於目前版本，連線中的 client 才會接受
      for (const [id, e] of incoming) {
        const cur = b.elements.get(id);
        const ne = { ...e, version: Math.max(e.version, cur?.version ?? 0) + 1, versionNonce: Math.floor(Math.random() * 2 ** 31) };
        b.elements.set(id, ne);
        changed.push(ne);
      }
      for (const [id, cur] of b.elements) {
        if (!incoming.has(id) && !cur.isDeleted) {
          const ne = { ...cur, isDeleted: true, version: cur.version + 1, versionNonce: Math.floor(Math.random() * 2 ** 31) };
          b.elements.set(id, ne);
          changed.push(ne);
        }
      }
      b.files = { ...b.files, ...(files as FileMap) };
      b.dirty = true;
      b.updatedAt = new Date();
      await flush(b);
      for (const o of membersOf(b.id)) {
        send(o.ws, { type: "files", boardId: b.id, files: b.files });
        send(o.ws, { type: "update", boardId: b.id, elements: changed, updatedAt: b.updatedAt });
      }
    },
  };

  async function shutdown() {
    clearInterval(timer);
    clearInterval(heartbeat);
    await flushAll();
    for (const c of clients) c.ws.close(1012, "restart");
  }

  return { handleUpgrade, api, shutdown, flushAll };
}
