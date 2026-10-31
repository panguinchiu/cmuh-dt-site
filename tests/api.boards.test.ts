import { beforeAll, describe, expect, it } from "vitest";
import * as versions from "@/app/api/boards/[id]/versions/route";
import * as version from "@/app/api/boards/[id]/versions/[vid]/route";
import * as restore from "@/app/api/boards/[id]/versions/[vid]/restore/route";
import { db } from "@/lib/db";
import { cookieFor, params, req, seedFixture } from "./helpers";

let f: Awaited<ReturnType<typeof seedFixture>>;
let s1: string, s2: string, ins: string;

beforeAll(async () => {
  f = await seedFixture();
  s1 = await cookieFor(f.s1.id);
  s2 = await cookieFor(f.s2.id);
  ins = await cookieFor(f.ins.id);
  await db.board.update({ where: { id: f.b1.id }, data: { scene: [{ id: "e1", version: 1, versionNonce: 1, type: "rectangle" }] } });
});

describe("白板 API 權限", () => {
  it("未登入 401", async () => {
    expect((await versions.GET(req(`/api/boards/${f.b1.id}/versions`), params({ id: f.b1.id }))).status).toBe(401);
  });
  it("別組學員讀寫白板被拒（403）", async () => {
    expect((await versions.GET(req(`/api/boards/${f.b1.id}/versions`, { cookie: s2 }), params({ id: f.b1.id }))).status).toBe(403);
    expect((await versions.POST(req(`/api/boards/${f.b1.id}/versions`, { method: "POST", cookie: s2, body: {} }), params({ id: f.b1.id }))).status).toBe(403);
  });
  it("本組學員可存版本、預覽、還原；還原前自動備份", async () => {
    const r = await versions.POST(req(`/api/boards/${f.b1.id}/versions`, { method: "POST", cookie: s1, body: { name: "v1" } }), params({ id: f.b1.id }));
    expect(r.status).toBe(201);
    const v = await r.json();
    await db.board.update({ where: { id: f.b1.id }, data: { scene: [] } });
    const p = { id: f.b1.id, vid: v.id };
    expect((await version.GET(req(`/api/boards/${f.b1.id}/versions/${v.id}`, { cookie: s1 }), params(p))).status).toBe(200);
    // 別組學員不能還原
    expect((await restore.POST(req(`/x`, { method: "POST", cookie: s2 }), params(p))).status).toBe(403);
    expect((await restore.POST(req(`/x`, { method: "POST", cookie: s1 }), params(p))).status).toBe(200);
    const b = await db.board.findUniqueOrThrow({ where: { id: f.b1.id } });
    expect((b.scene as { id: string }[]).map((e) => e.id)).toEqual(["e1"]);
    const names = (await db.boardVersion.findMany({ where: { boardId: f.b1.id } })).map((x) => x.name);
    expect(names.some((n) => n.startsWith("還原前自動備份"))).toBe(true);
  });
  it("版本不能跨白板讀取（用 b2 的路徑讀 b1 的版本 → 404）", async () => {
    const v = await db.boardVersion.findFirstOrThrow({ where: { boardId: f.b1.id } });
    expect((await version.GET(req(`/x`, { cookie: ins }), params({ id: f.b2.id, vid: v.id }))).status).toBe(404);
  });
  it("講師可讀任一組", async () => {
    expect((await versions.GET(req(`/x`, { cookie: ins }), params({ id: f.b2.id }))).status).toBe(200);
  });
});
