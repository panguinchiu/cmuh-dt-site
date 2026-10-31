import { describe, expect, it } from "vitest";
import {
  canEditBoard,
  canSubmitGameRound,
  canViewGameDashboard,
  canViewMatch,
  canViewResource,
  requireInstructor,
  requireUser,
  sideOf,
  type ResourceRef,
  type SessionUser,
} from "@/lib/authz";
import { HttpError } from "@/lib/http";

const G1 = "g1", G2 = "g2", G3 = "g3";
const s1: SessionUser = { id: "u1", name: "學員一", role: "student", groupId: G1 };
const s2: SessionUser = { id: "u2", name: "學員二", role: "student", groupId: G2 };
const s3: SessionUser = { id: "u3", name: "學員三", role: "student", groupId: G3 };
const ins: SessionUser = { id: "i1", name: "講師", role: "instructor", groupId: null };
const res = (v: ResourceRef["visibility"], groupIds: string[] = [], userIds: string[] = []): ResourceRef => ({ visibility: v, groupIds, userIds });

describe("requireUser / requireInstructor", () => {
  it("未登入一律 401", () => {
    expect(() => requireUser(null)).toThrowError(HttpError);
    try {
      requireUser(undefined);
    } catch (e) {
      expect((e as HttpError).status).toBe(401);
    }
    try {
      requireInstructor(null);
    } catch (e) {
      expect((e as HttpError).status).toBe(401);
    }
  });
  it("學員 requireInstructor → 403；講師通過", () => {
    try {
      requireInstructor(s1);
      expect.unreachable();
    } catch (e) {
      expect((e as HttpError).status).toBe(403);
    }
    expect(requireInstructor(ins)).toBe(ins);
  });
});

describe("canEditBoard", () => {
  it("學員只能讀寫自己組的白板", () => {
    expect(canEditBoard(s1, { groupId: G1 })).toBe(true);
    expect(canEditBoard(s1, { groupId: G2 })).toBe(false);
    expect(canEditBoard(s2, { groupId: G1 })).toBe(false);
  });
  it("講師可讀寫任一組", () => {
    expect(canEditBoard(ins, { groupId: G1 })).toBe(true);
    expect(canEditBoard(ins, { groupId: G3 })).toBe(true);
  });
  it("未登入 / 沒有組別 / 不存在的白板 → 拒絕", () => {
    expect(canEditBoard(null, { groupId: G1 })).toBe(false);
    expect(canEditBoard({ ...s1, groupId: null }, { groupId: G1 })).toBe(false);
    expect(canEditBoard(s1, null)).toBe(false);
  });
});

describe("canViewResource", () => {
  it("all_students：所有學員可見", () => {
    expect(canViewResource(s1, res("all_students"))).toBe(true);
    expect(canViewResource(s3, res("all_students"))).toBe(true);
  });
  it("groups：只有指定組別可見", () => {
    const r = res("groups", [G1, G3]);
    expect(canViewResource(s1, r)).toBe(true);
    expect(canViewResource(s3, r)).toBe(true);
    expect(canViewResource(s2, r)).toBe(false);
  });
  it("users：只有指定個人可見（同組其他人看不到）", () => {
    const r = res("users", [], ["u2"]);
    expect(canViewResource(s2, r)).toBe(true);
    expect(canViewResource(s1, r)).toBe(false);
    expect(canViewResource({ id: "u9", name: "同組", role: "student", groupId: G2 }, r)).toBe(false);
  });
  it("instructors_only：學員一律看不到", () => {
    expect(canViewResource(s1, res("instructors_only"))).toBe(false);
  });
  it("講師永遠看得到全部", () => {
    for (const v of ["all_students", "groups", "users", "instructors_only"] as const) expect(canViewResource(ins, res(v))).toBe(true);
  });
  it("未登入 → 拒絕", () => {
    expect(canViewResource(null, res("all_students"))).toBe(false);
  });
});

describe("賽局", () => {
  const mA = { medGroupId: G1, surgGroupId: G2 };
  it("sideOf 依組別帶出席位", () => {
    expect(sideOf(s1, mA)).toBe("med");
    expect(sideOf(s2, mA)).toBe("surg");
    expect(sideOf(s3, mA)).toBeNull();
  });
  it("學員只能寫己方席位", () => {
    expect(canSubmitGameRound(s1, mA, "med")).toBe(true);
    expect(canSubmitGameRound(s1, mA, "surg")).toBe(false); // 寫對方席位被拒
    expect(canSubmitGameRound(s2, mA, "surg")).toBe(true);
    expect(canSubmitGameRound(s2, mA, "med")).toBe(false);
  });
  it("不屬於該對局的學員不能寫任何席位", () => {
    expect(canSubmitGameRound(s3, mA, "med")).toBe(false);
    expect(canSubmitGameRound(s3, mA, "surg")).toBe(false);
  });
  it("講師可代填任一席位；未登入拒絕", () => {
    expect(canSubmitGameRound(ins, mA, "med")).toBe(true);
    expect(canSubmitGameRound(ins, mA, "surg")).toBe(true);
    expect(canSubmitGameRound(null, mA, "med")).toBe(false);
  });
  it("讀自己對局分數", () => {
    expect(canViewMatch(s1, mA)).toBe(true);
    expect(canViewMatch(s3, mA)).toBe(false);
    expect(canViewMatch(ins, mA)).toBe(true);
  });
  it("儀表板：未公開時學員被拒；公開後可讀；講師永遠可讀", () => {
    expect(canViewGameDashboard(s1, { published: false })).toBe(false);
    expect(canViewGameDashboard(s1, { published: true })).toBe(true);
    expect(canViewGameDashboard(ins, { published: false })).toBe(true);
    expect(canViewGameDashboard(null, { published: true })).toBe(false);
  });
});
