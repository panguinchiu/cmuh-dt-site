import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import * as me from "@/app/api/game/[slug]/me/route";
import * as dash from "@/app/api/game/[slug]/dashboard/route";
import * as publish from "@/app/api/game/[slug]/publish/route";
import * as round from "@/app/api/game/[slug]/matches/[id]/rounds/[n]/route";
import * as reset from "@/app/api/game/[slug]/matches/[id]/reset/route";
import * as pairing from "@/app/api/game/[slug]/matches/[id]/route";
import { cookieFor, params, req, seedFixture } from "./helpers";

let f: Awaited<ReturnType<typeof seedFixture>>;
let s1: string, s2: string, ins: string, outsider: string;
let matchId: string;
const slug = "icu-bed";

const put = (cookie: string | undefined, n: number, side: string, choice: string | null) =>
  round.PUT(req(`/api/game/${slug}/matches/${matchId}/rounds/${n}`, { method: "PUT", cookie, body: { side, choice } }), params({ slug, id: matchId, n: String(n) }));

beforeEach(async () => {
  f = await seedFixture();
  const g3 = await db.group.create({ data: { name: "第三組", sortOrder: 3, codeHash: "x" } });
  const s3 = await db.user.create({ data: { name: "學員丁", role: "student", groupId: g3.id } });
  const game = await db.game.create({ data: { slug, title: "加護病房床位的每月抉擇" } });
  const m = await db.gameMatch.create({
    data: { gameId: game.id, label: "A 對局", medGroupId: f.g1.id, surgGroupId: f.g2.id, rounds: { create: Array.from({ length: 8 }, (_, i) => ({ round: i + 1 })) } },
  });
  matchId = m.id;
  s1 = await cookieFor(f.s1.id); // 內科隊
  s2 = await cookieFor(f.s2.id); // 外科隊
  ins = await cookieFor(f.ins.id);
  outsider = await cookieFor(s3.id);
});

describe("賽局作答權限", () => {
  it("未登入 401", async () => {
    expect((await put(undefined, 1, "med", "FULL")).status).toBe(401);
    expect((await me.GET(req(`/api/game/${slug}/me`), params({ slug }))).status).toBe(401);
  });
  it("學員可寫己方席位；寫對方席位被拒 403", async () => {
    expect((await put(s1, 1, "med", "FULL")).status).toBe(200);
    expect((await put(s1, 1, "surg", "SELF")).status).toBe(403);
    expect((await put(s2, 1, "med", "SELF")).status).toBe(403);
    expect((await put(outsider, 1, "med", "FULL")).status).toBe(403);
    const r = await db.gameRound.findFirstOrThrow({ where: { matchId, round: 1 } });
    expect([r.medChoice, r.surgChoice]).toEqual(["FULL", null]);
  });
  it("輸入驗證：回合超出範圍、選項不合法 → 400", async () => {
    expect((await put(s1, 9, "med", "FULL")).status).toBe(400);
    expect((await put(s1, 1, "med", "MAYBE")).status).toBe(400);
  });
  it("同時亮牌：己方未出牌前看不到對方選擇；揭曉後學員不能改，講師可更正", async () => {
    await put(s2, 1, "surg", "HOLD");
    let mine = await (await me.GET(req("/x", { cookie: s1 }), params({ slug }))).json();
    expect(mine.match.side).toBe("med");
    expect(mine.match.rounds[0]).toMatchObject({ mine: null, theirs: null, theirsSubmitted: true, revealed: false });
    expect(JSON.stringify(mine)).not.toContain("HOLD");

    await put(s1, 1, "med", "FULL");
    mine = await (await me.GET(req("/x", { cookie: s1 }), params({ slug }))).json();
    expect(mine.match.rounds[0]).toMatchObject({ mine: "FULL", theirs: "HOLD", revealed: true });
    expect(mine.match.myTotal).toBe(2);
    expect(mine.match.opTotal).toBe(18);

    expect((await put(s1, 1, "med", "SELF")).status).toBe(409);
    expect((await put(ins, 1, "med", "SELF")).status).toBe(200);
  });
});

describe("儀表板與帶領者內容", () => {
  it("未公開時學員讀儀表板 403；/me 回應不含帶領者內容", async () => {
    expect((await dash.GET(req("/x", { cookie: s1 }), params({ slug }))).status).toBe(403);
    const body = JSON.stringify(await (await me.GET(req("/x", { cookie: s1 }), params({ slug }))).json());
    for (const word of ["ledger", "debrief", "揭盅", "總帳", "121", "背叛者"]) expect(body).not.toContain(word);
  });
  it("講師永遠可讀；學員不能切換公開", async () => {
    const r = await dash.GET(req("/x", { cookie: ins }), params({ slug }));
    expect(r.status).toBe(200);
    const d = await r.json();
    expect(d.ledger.map((l: { value: number }) => l.value)).toEqual([121, 55, 99]);
    expect(d.debrief).toHaveLength(4);
    expect((await publish.POST(req("/x", { method: "POST", cookie: s1, body: { published: true } }), params({ slug }))).status).toBe(403);
  });
  it("公開後學員可唯讀儀表板（含總帳），仍不能代填對方", async () => {
    expect((await publish.POST(req("/x", { method: "POST", cookie: ins, body: { published: true } }), params({ slug }))).status).toBe(200);
    const r = await dash.GET(req("/x", { cookie: s2 }), params({ slug }));
    expect(r.status).toBe(200);
    expect((await r.json()).ledger).toHaveLength(3);
    expect((await put(s2, 2, "med", "FULL")).status).toBe(403);
  });
});

describe("講師工具", () => {
  it("重置需二次確認；學員不能重置", async () => {
    await put(s1, 1, "med", "FULL");
    const p = params({ slug, id: matchId });
    expect((await reset.POST(req("/x", { method: "POST", cookie: s1, body: { confirm: "RESET" } }), p)).status).toBe(403);
    expect((await reset.POST(req("/x", { method: "POST", cookie: ins, body: {} }), p)).status).toBe(400);
    expect((await reset.POST(req("/x", { method: "POST", cookie: ins, body: { confirm: "RESET" } }), p)).status).toBe(200);
    expect(await db.gameRound.count({ where: { matchId, NOT: { medChoice: null } } })).toBe(0);
  });
  it("配對：同一組不能同時當兩隊", async () => {
    const p = params({ slug, id: matchId });
    expect((await pairing.PUT(req("/x", { method: "PUT", cookie: ins, body: { medGroupId: f.g1.id, surgGroupId: f.g1.id } }), p)).status).toBe(400);
    expect((await pairing.PUT(req("/x", { method: "PUT", cookie: ins, body: { medGroupId: f.g2.id, surgGroupId: f.g1.id } }), p)).status).toBe(200);
    const mine = await (await me.GET(req("/x", { cookie: s1 }), params({ slug }))).json();
    expect(mine.match.side).toBe("surg");
  });
});
