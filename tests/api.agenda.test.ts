import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import * as agenda from "@/app/api/agenda/route";
import * as agendaItem from "@/app/api/agenda/[id]/route";
import * as agendaOrder from "@/app/api/agenda/order/route";
import * as agendaCurrent from "@/app/api/agenda/current/route";
import { cookieFor, params, req, seedFixture } from "./helpers";

let f: Awaited<ReturnType<typeof seedFixture>>;
let student: string;
let instructor: string;

beforeEach(async () => {
  f = await seedFixture();
  student = await cookieFor(f.s1.id);
  instructor = await cookieFor(f.ins.id);
});

describe("議程 API 權限", () => {
  it("未登入一律 401", async () => {
    expect((await agenda.GET(req("/api/agenda"))).status).toBe(401);
    expect((await agenda.POST(req("/api/agenda", { method: "POST", body: { title: "x" } }))).status).toBe(401);
  });

  it("學員可讀議程，但所有修改都回 403", async () => {
    expect((await agenda.GET(req("/api/agenda", { cookie: student }))).status).toBe(200);
    const id = f.agenda[0].id;
    const calls = [
      agenda.POST(req("/api/agenda", { method: "POST", cookie: student, body: { title: "新段落" } })),
      agendaItem.PATCH(req(`/api/agenda/${id}`, { method: "PATCH", cookie: student, body: { title: "改" } }), params({ id })),
      agendaItem.DELETE(req(`/api/agenda/${id}`, { method: "DELETE", cookie: student }), params({ id })),
      agendaOrder.PUT(req("/api/agenda/order", { method: "PUT", cookie: student, body: { ids: f.agenda.map((a) => a.id).reverse() } })),
      agendaCurrent.PUT(req("/api/agenda/current", { method: "PUT", cookie: student, body: { id } })),
    ];
    for (const r of await Promise.all(calls)) expect(r.status).toBe(403);
    // 資料沒有被動到
    expect(await db.agendaItem.count()).toBe(3);
    expect((await db.agendaItem.findUniqueOrThrow({ where: { id } })).title).toBe("段落一");
  });
});

describe("議程 API 驗證", () => {
  it("輸入格式錯誤回 400", async () => {
    const id = f.agenda[0].id;
    const bad = [
      agenda.POST(req("/api/agenda", { method: "POST", cookie: instructor, body: { title: "" } })),
      agenda.POST(req("/api/agenda", { method: "POST", cookie: instructor, body: { title: "x".repeat(101) } })),
      agendaItem.PATCH(req(`/api/agenda/${id}`, { method: "PATCH", cookie: instructor, body: {} }), params({ id })),
      agendaItem.PATCH(req("/api/agenda/not-a-uuid", { method: "PATCH", cookie: instructor, body: { title: "x" } }), params({ id: "not-a-uuid" })),
      agendaOrder.PUT(req("/api/agenda/order", { method: "PUT", cookie: instructor, body: { ids: "nope" } })),
      // 排序清單缺段落 / 重複
      agendaOrder.PUT(req("/api/agenda/order", { method: "PUT", cookie: instructor, body: { ids: [f.agenda[0].id, f.agenda[1].id] } })),
      agendaOrder.PUT(req("/api/agenda/order", { method: "PUT", cookie: instructor, body: { ids: [f.agenda[0].id, f.agenda[0].id, f.agenda[1].id] } })),
      agendaCurrent.PUT(req("/api/agenda/current", { method: "PUT", cookie: instructor, body: { id: 123 } })),
    ];
    for (const r of await Promise.all(bad)) expect(r.status).toBe(400);
  });
});

describe("議程 API 講師操作", () => {
  it("新增排在最後、改標題", async () => {
    const r = await agenda.POST(req("/api/agenda", { method: "POST", cookie: instructor, body: { title: "段落四" } }));
    expect(r.status).toBe(201);
    const body = await r.json();
    expect(body.items.map((i: { title: string }) => i.title)).toEqual(["段落一", "段落二", "段落三", "段落四"]);
    expect(body.items.map((i: { no: number }) => i.no)).toEqual([1, 2, 3, 4]);

    const id = f.agenda[1].id;
    const r2 = await agendaItem.PATCH(req(`/api/agenda/${id}`, { method: "PATCH", cookie: instructor, body: { title: "段落二（改）" } }), params({ id }));
    expect(r2.status).toBe(200);
    expect((await r2.json()).items[1].title).toBe("段落二（改）");
  });

  it("排序結果正確", async () => {
    const [a, b, c] = f.agenda.map((x) => x.id);
    const r = await agendaOrder.PUT(req("/api/agenda/order", { method: "PUT", cookie: instructor, body: { ids: [c, a, b] } }));
    expect(r.status).toBe(200);
    const body = await r.json();
    expect(body.items.map((i: { id: string }) => i.id)).toEqual([c, a, b]);
    expect(body.items.map((i: { title: string }) => i.title)).toEqual(["段落三", "段落一", "段落二"]);
    const list = await (await agenda.GET(req("/api/agenda", { cookie: student }))).json();
    expect(list.items.map((i: { no: number; title: string }) => `${i.no}.${i.title}`)).toEqual(["1.段落三", "2.段落一", "3.段落二"]);
  });

  it("切換目前段落；刪除被指向的段落時清空目前段落", async () => {
    const id = f.agenda[1].id;
    const r = await agendaCurrent.PUT(req("/api/agenda/current", { method: "PUT", cookie: instructor, body: { id } }));
    expect((await r.json()).currentId).toBe(id);

    const d = await agendaItem.DELETE(req(`/api/agenda/${id}`, { method: "DELETE", cookie: instructor }), params({ id }));
    expect(d.status).toBe(200);
    const body = await d.json();
    expect(body.currentId).toBeNull();
    expect(body.items.map((i: { title: string }) => i.title)).toEqual(["段落一", "段落三"]);
    expect((await db.appState.findUniqueOrThrow({ where: { id: 1 } })).currentAgendaItemId).toBeNull();
  });

  it("刪除不是目前段落的段落時，目前段落不變", async () => {
    const cur = f.agenda[0].id;
    await agendaCurrent.PUT(req("/api/agenda/current", { method: "PUT", cookie: instructor, body: { id: cur } }));
    const id = f.agenda[2].id;
    const body = await (await agendaItem.DELETE(req(`/api/agenda/${id}`, { method: "DELETE", cookie: instructor }), params({ id }))).json();
    expect(body.currentId).toBe(cur);
  });

  it("不存在的段落回 404", async () => {
    const id = "00000000-0000-4000-8000-000000000000";
    expect((await agendaItem.DELETE(req(`/api/agenda/${id}`, { method: "DELETE", cookie: instructor }), params({ id }))).status).toBe(404);
  });
});
