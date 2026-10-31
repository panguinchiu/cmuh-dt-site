import { beforeEach, describe, expect, it } from "vitest";
import * as versions from "@/app/api/boards/[id]/versions/route";
import * as order from "@/app/api/boards/[id]/versions/order/route";
import * as version from "@/app/api/boards/[id]/versions/[vid]/route";
import * as copy from "@/app/api/boards/[id]/versions/[vid]/copy/route";
import { db } from "@/lib/db";
import { SEGMENT_PAGES, remapIds } from "@/lib/boards";
import { cookieFor, params, req, seedFixture } from "./helpers";

let f: Awaited<ReturnType<typeof seedFixture>>;
let s1: string, s2: string, ins: string;
type V = { id: string; name: string; active: boolean };

const rect = (id: string, extra: object = {}) => ({ id, version: 1, versionNonce: 1, type: "rectangle", isDeleted: false, ...extra });
const list = async (cookie = s1, boardId = f.b1.id) =>
  ((await (await versions.GET(req("/x", { cookie }), params({ id: boardId }))).json()).versions as V[]);
const sceneIds = async (boardId = f.b1.id) =>
  ((await db.board.findUniqueOrThrow({ where: { id: boardId } })).scene as { id: string; isDeleted?: boolean }[]).filter((e) => !e.isDeleted).map((e) => e.id);

beforeEach(async () => {
  f = await seedFixture();
  s1 = await cookieFor(f.s1.id);
  s2 = await cookieFor(f.s2.id);
  ins = await cookieFor(f.ins.id);
  await db.board.update({ where: { id: f.b1.id }, data: { scene: [rect("e1")] } });
});

describe("白板版本權限", () => {
  it("未登入 401；別組學員 403", async () => {
    expect((await versions.GET(req("/x"), params({ id: f.b1.id }))).status).toBe(401);
    expect((await versions.GET(req("/x", { cookie: s2 }), params({ id: f.b1.id }))).status).toBe(403);
    expect((await versions.POST(req("/x", { method: "POST", cookie: s2, body: {} }), params({ id: f.b1.id }))).status).toBe(403);
    const v = (await list())[1];
    expect((await order.PUT(req("/x", { method: "PUT", cookie: s2, body: { ids: [v.id] } }), params({ id: f.b1.id }))).status).toBe(403);
    expect((await copy.POST(req("/x", { method: "POST", cookie: s2, body: { targetId: v.id, mode: "append" } }), params({ id: f.b1.id, vid: v.id }))).status).toBe(403);
  });
  it("講師可讀任一組", async () => {
    expect((await list(ins, f.b2.id)).length).toBe(SEGMENT_PAGES.length);
  });
});

describe("課程段落版本與置頂切換", () => {
  it("每塊白板自動有 4 個段落版本，第一個（定義問題）置頂並承接畫面原有內容", async () => {
    const v = await list();
    expect(v.map((x) => x.name)).toEqual(SEGMENT_PAGES);
    expect(v[0].active).toBe(true);
    const c = await (await version.GET(req("/x", { cookie: s1 }), params({ id: f.b1.id, vid: v[0].id }))).json();
    expect(c.elements.map((e: { id: string }) => e.id)).toEqual(["e1"]);
    // 重複呼叫不會重複建立
    expect((await list()).length).toBe(4);
  });

  it("把別的版本拖到最上面 → 畫面換成該版本；原置頂版本保留畫面內容", async () => {
    const [p1, p2, p3, p4] = await list();
    let r = await order.PUT(req("/x", { method: "PUT", cookie: s1, body: { ids: [p2.id, p1.id, p3.id, p4.id] } }), params({ id: f.b1.id }));
    expect(r.status).toBe(200);
    expect(((await r.json()).versions as V[])[0]).toMatchObject({ id: p2.id, active: true });
    expect(await sceneIds()).toEqual([]); // 發想與收斂是空的
    await db.board.update({ where: { id: f.b1.id }, data: { scene: [rect("idea")] } }); // 在發想與收斂上畫東西
    r = await order.PUT(req("/x", { method: "PUT", cookie: s1, body: { ids: [p1.id, p2.id, p3.id, p4.id] } }), params({ id: f.b1.id }));
    expect(await sceneIds()).toEqual(["e1"]);
    const p2c = await (await version.GET(req("/x", { cookie: s1 }), params({ id: f.b1.id, vid: p2.id }))).json();
    expect(p2c.elements.map((e: { id: string }) => e.id)).toEqual(["idea"]);
  });

  it("排序清單缺項或重複 → 400", async () => {
    const v = await list();
    expect((await order.PUT(req("/x", { method: "PUT", cookie: s1, body: { ids: [v[0].id] } }), params({ id: f.b1.id }))).status).toBe(400);
    expect((await order.PUT(req("/x", { method: "PUT", cookie: s1, body: { ids: [v[0].id, v[0].id, v[1].id, v[2].id] } }), params({ id: f.b1.id }))).status).toBe(400);
  });

  it("存成版本會放在置頂版本正下方", async () => {
    await versions.POST(req("/x", { method: "POST", cookie: s1, body: { name: "快照" } }), params({ id: f.b1.id }));
    const v = await list();
    expect(v.map((x) => x.name)).toEqual(["定義問題", "快照", "發想與收斂", "第一個未來解方", "修正原型"]);
  });

  it("置頂版本不能刪除；其他版本可刪", async () => {
    const v = await list();
    expect((await version.DELETE(req("/x", { method: "DELETE", cookie: s1 }), params({ id: f.b1.id, vid: v[0].id }))).status).toBe(400);
    expect((await version.DELETE(req("/x", { method: "DELETE", cookie: s1 }), params({ id: f.b1.id, vid: v[3].id }))).status).toBe(200);
    expect((await list()).length).toBe(3);
  });
});

describe("版本互相複製", () => {
  it("加入：複製到其他版本，換新 id、保留目標原內容", async () => {
    const [p1, p2] = await list();
    await copy.POST(req("/x", { method: "POST", cookie: s1, body: { targetId: p2.id, mode: "append" } }), params({ id: f.b1.id, vid: p1.id }));
    await copy.POST(req("/x", { method: "POST", cookie: s1, body: { targetId: p2.id, mode: "append" } }), params({ id: f.b1.id, vid: p1.id }));
    const c = await (await version.GET(req("/x", { cookie: s1 }), params({ id: f.b1.id, vid: p2.id }))).json();
    expect(c.elements).toHaveLength(2);
    expect(new Set(c.elements.map((e: { id: string }) => e.id)).size).toBe(2);
    expect(c.elements.map((e: { id: string }) => e.id)).not.toContain("e1");
  });
  it("取代：複製到畫面上的版本 → 畫面內容被取代", async () => {
    const [p1, p2] = await list();
    await db.boardVersion.update({ where: { id: p2.id }, data: { scene: [rect("from-p2")] } });
    const r = await copy.POST(req("/x", { method: "POST", cookie: s1, body: { targetId: p1.id, mode: "replace" } }), params({ id: f.b1.id, vid: p2.id }));
    expect(r.status).toBe(200);
    expect(await sceneIds()).toEqual(["from-p2"]);
  });
  it("來源與目標相同 → 400；跨白板的版本 → 404", async () => {
    const [p1] = await list();
    expect((await copy.POST(req("/x", { method: "POST", cookie: s1, body: { targetId: p1.id, mode: "append" } }), params({ id: f.b1.id, vid: p1.id }))).status).toBe(400);
    const other = (await list(ins, f.b2.id))[1];
    expect((await copy.POST(req("/x", { method: "POST", cookie: ins, body: { targetId: other.id, mode: "append" } }), params({ id: f.b1.id, vid: p1.id }))).status).toBe(404);
  });
  it("remapIds 一併更新文字容器與群組", () => {
    const out = remapIds([
      { id: "box", type: "rectangle", boundElements: [{ id: "txt", type: "text" }], groupIds: ["g"] },
      { id: "txt", type: "text", containerId: "box", groupIds: ["g"] },
    ]);
    expect(out[1].containerId).toBe(out[0].id);
    expect((out[0].boundElements as { id: string }[])[0].id).toBe(out[1].id);
    expect(out[0].groupIds).toEqual(out[1].groupIds);
    expect(out[0].groupIds).not.toEqual(["g"]);
  });
});
