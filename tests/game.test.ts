import { describe, expect, it } from "vitest";
import { computeMatch, verdict, type Choice, COOP_MAX, JOINT_MAX, MUTUAL_SELF } from "@/lib/game";

const all = (m: Choice, s: Choice) => Array.from({ length: 8 }, (_, i) => ({ round: i + 1, med: m, surg: s }));

describe("computeMatch", () => {
  it("全程共好 = 121 / 121，合計 242，無脫離", () => {
    const r = computeMatch(all("FULL", "FULL"));
    expect(r.medTotal).toBe(COOP_MAX);
    expect(r.surgTotal).toBe(121);
    expect(r.joint).toBe(JOINT_MAX);
    expect(r.ratio).toBe(1);
    expect(r.defect).toBeNull();
    expect(r.completed).toBe(8);
    expect(verdict(r.ratio, r.played).text).toBe("接近全程共好");
  });

  it("全程互相自保 = 55 / 55，第 1 回合即脫離", () => {
    const r = computeMatch(all("SELF", "SELF"));
    expect(r.medTotal).toBe(MUTUAL_SELF);
    expect(r.surgTotal).toBe(55);
    expect(r.joint).toBe(110);
    expect(r.defect).toBe(1);
    expect(verdict(r.ratio, true).text).toBe("信任崩壞，雙輸");
  });

  it("內科第 4 回合保留一手（搶 36 點）、招致報復崩到自保 → 背叛者約 99，低於 121", () => {
    const rounds = [
      ...[1, 2, 3].map((n) => ({ round: n, med: "FULL" as Choice, surg: "FULL" as Choice })),
      { round: 4, med: "HOLD" as Choice, surg: "FULL" as Choice },
      ...[5, 6, 7, 8].map((n) => ({ round: n, med: "SELF" as Choice, surg: "SELF" as Choice })),
    ];
    const r = computeMatch(rounds);
    expect(r.rows[3].medPts).toBe(18);
    expect(r.rows[3].medCum! - r.rows[2].medCum!).toBe(36);
    expect(r.medTotal).toBe(99);
    expect(r.surgTotal).toBe(33 + 4 + 30);
    expect(r.medTotal).toBeLessThan(COOP_MAX);
    expect(r.defect).toBe(4);
  });

  it("只填一邊的回合不計分；加權套在第 4、8 回合", () => {
    const r = computeMatch([
      { round: 1, med: "FULL", surg: null },
      { round: 8, med: "FULL", surg: "FULL" },
    ]);
    expect(r.rows[0].medPts).toBeNull();
    expect(r.medTotal).toBe(33);
    expect(r.completed).toBe(1);
    expect(r.defect).toBeNull();
  });

  it("收益矩陣不對稱格子（內科, 外科）", () => {
    const r = computeMatch([{ round: 1, med: "FULL", surg: "SELF" }]);
    expect([r.medTotal, r.surgTotal]).toEqual([2, 15]);
    const r2 = computeMatch([{ round: 1, med: "SELF", surg: "HOLD" }]);
    expect([r2.medTotal, r2.surgTotal]).toEqual([15, 3]);
  });

  it("verdict 門檻", () => {
    expect(verdict(0, false).text).toBe("（尚未開始）");
    expect(verdict(0.85, true).text).toBe("接近全程共好");
    expect(verdict(0.6, true).text).toBe("多數回合合作");
    expect(verdict(0.46, true).text).toBe("偏向僵局");
    expect(verdict(0.45, true).text).toBe("信任崩壞，雙輸");
  });
});
