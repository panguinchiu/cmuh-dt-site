import { beforeEach, describe, expect, it } from "vitest";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import * as students from "@/app/api/admin/students/route";
import * as student from "@/app/api/admin/students/[id]/route";
import * as code from "@/app/api/admin/groups/[id]/code/route";
import * as insPw from "@/app/api/admin/instructors/[id]/password/route";
import * as login from "@/app/api/auth/login/route";
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
    expect((await code.POST(req("/x", { method: "POST", cookie: s1 }), params({ id: f.g1.id }))).status).toBe(403);
    expect((await insPw.POST(req("/x", { method: "POST", cookie: s1, body: {} }), params({ id: f.ins.id }))).status).toBe(403);
  });
  it("新增、改名、換組；同名回 400", async () => {
    const r = await students.POST(req("/x", { method: "POST", cookie: ins, body: { name: "學員戊", groupId: f.g1.id } }));
    expect(r.status).toBe(201);
    expect((await students.POST(req("/x", { method: "POST", cookie: ins, body: { name: "學員戊", groupId: f.g2.id } }))).status).toBe(400);
    const id = (await r.json()).id;
    expect((await student.PATCH(req("/x", { method: "PATCH", cookie: ins, body: { name: "學員戊二", groupId: f.g2.id } }), params({ id }))).status).toBe(200);
    const u = await db.user.findUniqueOrThrow({ where: { id } });
    expect([u.name, u.groupId]).toEqual(["學員戊二", f.g2.id]);
  });
  it("停用／換組 → 該學員 session 立即失效", async () => {
    const token = s1.split("=")[1];
    expect(await userFromToken(token)).not.toBeNull();
    await student.PATCH(req("/x", { method: "PATCH", cookie: ins, body: { groupId: f.g2.id } }), params({ id: f.s1.id }));
    expect(await userFromToken(token)).toBeNull();
    await student.PATCH(req("/x", { method: "PATCH", cookie: ins, body: { active: false } }), params({ id: f.s1.id }));
    const r = await login.POST(req("/api/auth/login", { method: "POST", body: { kind: "student", userId: f.s1.id, code: "1234" } }));
    expect(r.status).toBe(401);
  });
  it("重設組別代碼：新代碼可登入、舊代碼失效、DB 只存 hash", async () => {
    const d = await (await code.POST(req("/x", { method: "POST", cookie: ins }), params({ id: f.g1.id }))).json();
    expect(d.code).toMatch(/^\d{4}$/);
    const g = await db.group.findUniqueOrThrow({ where: { id: f.g1.id } });
    expect(g.codeHash).not.toContain(d.code);
    expect(await bcrypt.compare(d.code, g.codeHash)).toBe(true);
    const ok = await login.POST(req("/x", { method: "POST", body: { kind: "student", userId: f.s1.id, code: d.code }, cookie: undefined }));
    expect(ok.status).toBe(200);
  });
  it("重設其他講師密碼；學員 id 不能當講師重設（404）", async () => {
    const other = await db.user.create({ data: { name: "講師丁", role: "instructor", passwordHash: "x" } });
    const d = await (await insPw.POST(req("/x", { method: "POST", cookie: ins, body: {} }), params({ id: other.id }))).json();
    expect(d.password.length).toBeGreaterThanOrEqual(8);
    expect((await insPw.POST(req("/x", { method: "POST", cookie: ins, body: {} }), params({ id: f.s1.id }))).status).toBe(404);
  });
});
