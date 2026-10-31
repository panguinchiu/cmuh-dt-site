import { beforeEach, describe, expect, it, vi } from "vitest";

// 不真的寄信：攔下寄出的連結
const sent: { to: string; link: string }[] = [];
vi.mock("@/lib/mail", async (orig) => {
  const real = await orig<typeof import("@/lib/mail")>();
  return {
    ...real,
    mailConfigured: () => process.env.TEST_MAIL === "on",
    sendResetMail: async (to: string, _name: string, link: string) => {
      sent.push({ to, link });
    },
  };
});

import { db } from "@/lib/db";
import * as login from "@/app/api/auth/login/route";
import * as setup from "@/app/api/auth/setup/route";
import * as forgot from "@/app/api/auth/forgot/route";
import * as reset from "@/app/api/auth/reset/route";
import * as mePw from "@/app/api/me/password/route";
import * as profile from "@/app/api/me/profile/route";
import { userFromToken } from "@/lib/session";
import { COURSE_PASS, cookieFor, req, seedFixture } from "./helpers";

let f: Awaited<ReturnType<typeof seedFixture>>;
let ipN = 0;
// 每個測試用不同 IP，避免互相吃到 rate limit
const post = (path: string, body: object) => {
  const r = req(path, { method: "POST", body });
  r.headers.set("x-forwarded-for", `10.0.${Math.floor(ipN / 250)}.${ipN % 250}`);
  return r;
};
const cookieOf = (r: Response) => r.headers.get("set-cookie")?.split(";")[0].split("=")[1];

beforeEach(async () => {
  f = await seedFixture();
  ipN++;
  sent.length = 0;
  delete process.env.TEST_MAIL;
});

describe("第一次登入：課程通關密碼＋自設密碼", () => {
  it("尚未設定密碼的人用密碼登入 → 409 needsSetup", async () => {
    const r = await login.POST(post("/x", { userId: f.s1.id, password: "whatever" }));
    expect(r.status).toBe(409);
    expect((await r.json()).needsSetup).toBe(true);
  });
  it("通關密碼錯 → 401；格式錯（密碼太短、沒有 email）→ 400", async () => {
    expect((await setup.POST(post("/x", { userId: f.s1.id, passphrase: "錯的", password: "abcdef", email: "a@b.co" }))).status).toBe(401);
    expect((await setup.POST(post("/x", { userId: f.s1.id, passphrase: COURSE_PASS, password: "abc", email: "a@b.co" }))).status).toBe(400);
    expect((await setup.POST(post("/x", { userId: f.s1.id, passphrase: COURSE_PASS, password: "abcdef" }))).status).toBe(400);
    expect((await db.user.findUniqueOrThrow({ where: { id: f.s1.id } })).passwordHash).toBeNull();
  });
  it("設定成功即登入；之後用自己的密碼登入；不能再用通關密碼覆蓋", async () => {
    const r = await setup.POST(post("/x", { userId: f.s1.id, passphrase: ` ${COURSE_PASS} `, password: "mypass1", email: "Stu1@Example.com" }));
    expect(r.status).toBe(200);
    expect(await userFromToken(cookieOf(r))).toMatchObject({ id: f.s1.id });
    expect((await db.user.findUniqueOrThrow({ where: { id: f.s1.id } })).email).toBe("stu1@example.com");
    expect((await login.POST(post("/x", { userId: f.s1.id, password: "mypass1" }))).status).toBe(200);
    expect((await login.POST(post("/x", { userId: f.s1.id, password: "wrong" }))).status).toBe(401);
    expect((await setup.POST(post("/x", { userId: f.s1.id, passphrase: COURSE_PASS, password: "hijack1", email: "x@y.co" }))).status).toBe(409);
  });
  it("通關密碼猜錯太多次 → 429", async () => {
    let last = 0;
    for (let i = 0; i < 6; i++) last = (await setup.POST(post("/x", { userId: f.s2.id, passphrase: `guess${i}`, password: "abcdef", email: "a@b.co" }))).status;
    expect(last).toBe(429);
  });
  it("停用的帳號不能設定", async () => {
    await db.user.update({ where: { id: f.s2.id }, data: { active: false } });
    expect((await setup.POST(post("/x", { userId: f.s2.id, passphrase: COURSE_PASS, password: "abcdef", email: "a@b.co" }))).status).toBe(400);
  });
});

describe("忘記密碼", () => {
  beforeEach(async () => {
    await setup.POST(post("/x", { userId: f.s1.id, passphrase: COURSE_PASS, password: "oldpass1", email: "stu1@example.com" }));
  });

  it("已設定寄信 → 寄出連結；用連結設新密碼後登入，舊密碼失效、連結只能用一次", async () => {
    process.env.TEST_MAIL = "on";
    const r = await forgot.POST(post("/x", { userId: f.s1.id }));
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ via: "email", to: "s***@example.com" });
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe("stu1@example.com");
    const token = new URL(sent[0].link).searchParams.get("token")!;
    // DB 不存明文 token
    expect((await db.user.findUniqueOrThrow({ where: { id: f.s1.id } })).resetTokenHash).not.toBe(token);
    const ok = await reset.POST(post("/x", { token, password: "newpass1" }));
    expect(ok.status).toBe(200);
    expect(await userFromToken(cookieOf(ok))).toMatchObject({ id: f.s1.id });
    expect((await login.POST(post("/x", { userId: f.s1.id, password: "oldpass1" }))).status).toBe(401);
    expect((await login.POST(post("/x", { userId: f.s1.id, password: "newpass1" }))).status).toBe(200);
    expect((await reset.POST(post("/x", { token, password: "again123" }))).status).toBe(400);
  });

  it("連結過期 → 400", async () => {
    process.env.TEST_MAIL = "on";
    await forgot.POST(post("/x", { userId: f.s1.id }));
    const token = new URL(sent[0].link).searchParams.get("token")!;
    await db.user.update({ where: { id: f.s1.id }, data: { resetTokenExpiresAt: new Date(Date.now() - 1000) } });
    expect((await reset.POST(post("/x", { token, password: "newpass1" }))).status).toBe(400);
  });

  it("未設定寄信 → 改為向講師申請（記錄申請時間，不寄信）", async () => {
    const r = await forgot.POST(post("/x", { userId: f.s1.id }));
    expect(await r.json()).toMatchObject({ via: "instructor" });
    expect(sent).toHaveLength(0);
    expect((await db.user.findUniqueOrThrow({ where: { id: f.s1.id } })).resetRequestedAt).not.toBeNull();
  });

  it("還沒設定過密碼的人 → 提示直接用通關密碼設定", async () => {
    expect(await (await forgot.POST(post("/x", { userId: f.s2.id }))).json()).toMatchObject({ via: "setup" });
  });

  it("同一 IP 申請太多次 → 429", async () => {
    let last = 0;
    for (let i = 0; i < 6; i++) last = (await forgot.POST(post("/x", { userId: f.s2.id }))).status;
    expect(last).toBe(429);
  });
});

describe("我的帳號", () => {
  it("學員可改自己的密碼與 email；目前密碼錯 → 400", async () => {
    await setup.POST(post("/x", { userId: f.s1.id, passphrase: COURSE_PASS, password: "oldpass1", email: "a@b.co" }));
    const c = await cookieFor(f.s1.id);
    expect((await mePw.POST(req("/x", { method: "POST", cookie: c, body: { current: "bad", next: "newpass1" } }))).status).toBe(400);
    expect((await mePw.POST(req("/x", { method: "POST", cookie: c, body: { current: "oldpass1", next: "newpass1" } }))).status).toBe(200);
    expect((await profile.PATCH(req("/x", { method: "PATCH", cookie: c, body: { email: "new@b.co" } }))).status).toBe(200);
    expect((await db.user.findUniqueOrThrow({ where: { id: f.s1.id } })).email).toBe("new@b.co");
    expect((await profile.PATCH(req("/x", { method: "PATCH", body: { email: "new@b.co" } }))).status).toBe(401);
  });
});
