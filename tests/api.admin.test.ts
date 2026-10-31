import { beforeEach, describe, expect, it } from "vitest";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import * as students from "@/app/api/admin/students/route";
import * as student from "@/app/api/admin/students/[id]/route";
import * as resetPw from "@/app/api/admin/users/[id]/reset-password/route";
import * as dismiss from "@/app/api/admin/users/[id]/dismiss-reset/route";
import * as coursePass from "@/app/api/admin/course-pass/route";
import { userFromToken } from "@/lib/session";
import { cookieFor, params, req, seedFixture } from "./helpers";

let f: Awaited<ReturnType<typeof seedFixture>>;
let s1: string, ins: string;
beforeEach(async () => {
  f = await seedFixture();
  s1 = await cookieFor(f.s1.id);
  ins = await cookieFor(f.ins.id);
});

describe("管理 API", () => {
  it("學員呼叫一律 403", async () => {
    expect((await students.POST(req("/x", { method: "POST", cookie: s1, body: { name: "新", groupId: f.g1.id } }))).status).toBe(403);
    expect((await student.PATCH(req("/x", { method: "PATCH", cookie: s1, body: { name: "x" } }), params({ id: f.s2.id }))).status).toBe(403);
    expect((await resetPw.POST(req("/x", { method: "POST", cookie: s1 }), params({ id: f.s2.id }))).status).toBe(403);
    expect((await dismiss.POST(req("/x", { method: "POST", cookie: s1 }), params({ id: f.s2.id }))).status).toBe(403);
    expect((await coursePass.PUT(req("/x", { method: "PUT", cookie: s1, body: { passphrase: "abcd" } }))).status).toBe(403);
  });
  it("新增、改名、換組、改 email；同名回 400；email 格式錯回 400", async () => {
    const r = await students.POST(req("/x", { method: "POST", cookie: ins, body: { name: "學員戊", groupId: f.g1.id } }));
    expect(r.status).toBe(201);
    expect((await students.POST(req("/x", { method: "POST", cookie: ins, body: { name: "學員戊", groupId: f.g2.id } }))).status).toBe(400);
    const id = (await r.json()).id;
    expect((await student.PATCH(req("/x", { method: "PATCH", cookie: ins, body: { name: "學員戊二", groupId: f.g2.id, email: "Wu@Example.com" } }), params({ id }))).status).toBe(200);
    const u = await db.user.findUniqueOrThrow({ where: { id } });
    expect([u.name, u.groupId, u.email]).toEqual(["學員戊二", f.g2.id, "wu@example.com"]);
    expect((await student.PATCH(req("/x", { method: "PATCH", cookie: ins, body: { email: "not-an-email" } }), params({ id }))).status).toBe(400);
  });
  it("停用／換組 → 該學員 session 立即失效", async () => {
    const token = s1.split("=")[1];
    expect(await userFromToken(token)).not.toBeNull();
    await student.PATCH(req("/x", { method: "PATCH", cookie: ins, body: { groupId: f.g2.id } }), params({ id: f.s1.id }));
    expect(await userFromToken(token)).toBeNull();
  });
  it("重設密碼：清空密碼、清掉申請、登出對方", async () => {
    await db.user.update({ where: { id: f.s1.id }, data: { passwordHash: "x", resetRequestedAt: new Date() } });
    const token = s1.split("=")[1];
    expect((await resetPw.POST(req("/x", { method: "POST", cookie: ins }), params({ id: f.s1.id }))).status).toBe(200);
    const u = await db.user.findUniqueOrThrow({ where: { id: f.s1.id } });
    expect([u.passwordHash, u.resetRequestedAt]).toEqual([null, null]);
    expect(await userFromToken(token)).toBeNull();
  });
  it("忽略申請只清申請、不動密碼", async () => {
    await db.user.update({ where: { id: f.s2.id }, data: { passwordHash: "keep", resetRequestedAt: new Date() } });
    await dismiss.POST(req("/x", { method: "POST", cookie: ins }), params({ id: f.s2.id }));
    const u = await db.user.findUniqueOrThrow({ where: { id: f.s2.id } });
    expect([u.passwordHash, u.resetRequestedAt]).toEqual(["keep", null]);
  });
  it("講師更新課程通關密碼：只存 hash；太短回 400", async () => {
    expect((await coursePass.PUT(req("/x", { method: "PUT", cookie: ins, body: { passphrase: "ab" } }))).status).toBe(400);
    expect((await coursePass.PUT(req("/x", { method: "PUT", cookie: ins, body: { passphrase: "新通關2026" } }))).status).toBe(200);
    const s = await db.appState.findUniqueOrThrow({ where: { id: 1 } });
    expect(s.coursePassHash).not.toContain("新通關");
    expect(await bcrypt.compare("新通關2026", s.coursePassHash!)).toBe(true);
  });
});
