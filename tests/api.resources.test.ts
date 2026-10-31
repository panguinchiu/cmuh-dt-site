import { beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import * as list from "@/app/api/resources/route";
import * as item from "@/app/api/resources/[id]/route";
import * as download from "@/app/api/resources/[id]/download/route";
import * as playUrlRoute from "@/app/api/resources/[id]/play-url/route";
import * as play from "@/app/play/[id]/[token]/[...path]/route";
import { makePlayToken, readPlayToken } from "@/lib/play-token";
import { safePath } from "@/lib/uploads";
import { cookieFor, params, req, seedFixture } from "./helpers";

let f: Awaited<ReturnType<typeof seedFixture>>;
let s1: string, s2: string, ins: string;
const R: Record<string, string> = {};

async function mk(title: string, visibility: "all_students" | "groups" | "users" | "instructors_only", extra: { groupIds?: string[]; userIds?: string[]; type?: "file" | "html_game" } = {}) {
  const r = await db.resource.create({
    data: {
      title,
      type: extra.type ?? "file",
      blobKey: extra.type === "html_game" ? "games/test" : "files/test",
      fileName: `${title}.pdf`,
      visibility,
      groups: { create: (extra.groupIds ?? []).map((groupId) => ({ groupId })) },
      users: { create: (extra.userIds ?? []).map((userId) => ({ userId })) },
    },
  });
  R[title] = r.id;
}

beforeAll(async () => {
  f = await seedFixture();
  s1 = await cookieFor(f.s1.id);
  s2 = await cookieFor(f.s2.id);
  ins = await cookieFor(f.ins.id);
  await mk("全體", "all_students");
  await mk("第一組限定", "groups", { groupIds: [f.g1.id] });
  await mk("學員乙限定", "users", { userIds: [f.s2.id] });
  await mk("講師限定", "instructors_only");
  await mk("遊戲一組", "groups", { groupIds: [f.g1.id], type: "html_game" });
});

const titles = async (cookie: string) => ((await (await list.GET(req("/api/resources", { cookie }))).json()).resources as { title: string }[]).map((r) => r.title).sort();

describe("資源列表：可見範圍伺服器端過濾", () => {
  it("未登入 401", async () => {
    expect((await list.GET(req("/api/resources"))).status).toBe(401);
  });
  it("各帳號只拿到看得到的資源", async () => {
    expect(await titles(s1)).toEqual(["全體", "第一組限定", "遊戲一組"].sort());
    expect(await titles(s2)).toEqual(["全體", "學員乙限定"].sort());
    expect(await titles(ins)).toHaveLength(5);
  });
  it("學員回應不含可見範圍設定（visibility/groupIds/userIds）", async () => {
    const body = await (await list.GET(req("/api/resources", { cookie: s1 }))).json();
    expect(body.resources[0]).not.toHaveProperty("visibility");
    expect(body.resources[0]).not.toHaveProperty("userIds");
  });
  it("學員不能新增/修改/刪除資源", async () => {
    expect((await list.POST(req("/api/resources", { method: "POST", cookie: s1, body: { type: "link", url: "https://example.com", title: "x", visibility: "all_students" } }))).status).toBe(403);
    const id = R["全體"];
    expect((await item.PATCH(req("/x", { method: "PATCH", cookie: s1, body: { title: "改", visibility: "all_students" } }), params({ id }))).status).toBe(403);
    expect((await item.DELETE(req("/x", { method: "DELETE", cookie: s1 }), params({ id }))).status).toBe(403);
  });
  it("講師新增連結：只收 http/https；groups 範圍需選組別", async () => {
    const bad = await list.POST(req("/x", { method: "POST", cookie: ins, body: { type: "link", url: "javascript:alert(1)", title: "x", visibility: "all_students" } }));
    expect(bad.status).toBe(400);
    const noGroup = await list.POST(req("/x", { method: "POST", cookie: ins, body: { type: "link", url: "https://example.com", title: "x", visibility: "groups" } }));
    expect(noGroup.status).toBe(400);
    const ok = await list.POST(req("/x", { method: "POST", cookie: ins, body: { type: "link", url: "https://example.com/game", title: "外部遊戲", visibility: "groups", groupIds: [f.g2.id] } }));
    expect(ok.status).toBe(201);
    expect(await titles(s2)).toContain("外部遊戲");
    expect(await titles(s1)).not.toContain("外部遊戲");
  });
});

describe("下載：伺服器驗權 + 短效 SAS", () => {
  const dl = (cookie: string | undefined, id: string) => download.GET(req(`/api/resources/${id}/download`, { cookie }), params({ id }));
  it("不可見資源回 404（不洩漏存在），與不存在相同", async () => {
    expect((await dl(s2, R["第一組限定"])).status).toBe(404);
    expect((await dl(s1, R["講師限定"])).status).toBe(404);
    expect((await dl(s1, R["學員乙限定"])).status).toBe(404);
    expect((await dl(s1, "00000000-0000-4000-8000-000000000000")).status).toBe(404);
    expect((await dl(undefined, R["全體"])).status).toBe(401);
  });
  it("可見資源 302 到 5 分鐘唯讀 SAS，並指定下載檔名", async () => {
    const r = await dl(s1, R["第一組限定"]);
    expect(r.status).toBe(302);
    const u = new URL(r.headers.get("location")!);
    expect(u.searchParams.get("sp")).toBe("r");
    expect(u.searchParams.get("sig")).toBeTruthy();
    expect(u.searchParams.get("sr")).toBe("b");
    const ttl = new Date(u.searchParams.get("se")!).getTime() - Date.now();
    expect(ttl).toBeGreaterThan(4 * 60_000);
    expect(ttl).toBeLessThanOrEqual(5 * 60_000 + 1000);
    expect(decodeURIComponent(u.searchParams.get("rscd")!)).toContain("attachment");
  });
});

describe("HTML 遊戲隔離", () => {
  it("play-url 只給看得到的人", async () => {
    const id = R["遊戲一組"];
    expect((await playUrlRoute.GET(req("/x", { cookie: s2 }), params({ id }))).status).toBe(404);
    const ok = await playUrlRoute.GET(req("/x", { cookie: s1 }), params({ id }));
    expect(ok.status).toBe(200);
    expect((await ok.json()).url).toMatch(new RegExp(`^/play/${id}/[^/]+/index.html$`));
  });
  it("token：竄改、過期、換資源都無效", () => {
    const t = makePlayToken("r1", "u1");
    expect(readPlayToken(t, "r1")).toEqual({ userId: "u1" });
    expect(readPlayToken(t, "r2")).toBeNull();
    expect(readPlayToken(t.slice(0, -2) + "xx", "r1")).toBeNull();
    expect(readPlayToken(makePlayToken("r1", "u1", Date.now() - 4 * 3600_000), "r1")).toBeNull();
  });
  it("無效 token、或 token 主人已看不到資源 → 404，且帶 sandbox CSP、不帶 Set-Cookie", async () => {
    const id = R["遊戲一組"];
    const bad = await play.GET(req(`/play/${id}/x/index.html`), params({ id, token: "x", path: ["index.html"] }));
    expect(bad.status).toBe(404);
    expect(bad.headers.get("content-security-policy")).toContain("sandbox allow-scripts");
    expect(bad.headers.get("content-security-policy")).not.toContain("allow-same-origin");
    expect(bad.headers.get("set-cookie")).toBeNull();
    const t2 = makePlayToken(id, f.s2.id); // 學員乙不在第一組
    expect((await play.GET(req("/x"), params({ id, token: t2, path: ["index.html"] }))).status).toBe(404);
  });
  it("zip 路徑過濾", () => {
    expect(safePath("index.html")).toBe("index.html");
    expect(safePath("assets/app.js")).toBe("assets/app.js");
    expect(safePath("../secret")).toBeNull();
    expect(safePath("/etc/passwd")).toBeNull();
    expect(safePath("a\\b")).toBeNull();
  });
});
