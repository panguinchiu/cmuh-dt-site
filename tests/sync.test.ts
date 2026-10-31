import { describe, expect, it } from "vitest";
import { wins } from "@/ws/hub-impl";
import { dataUrlBytes, unsynced } from "@/components/board/sync";

const el = (id: string, version: number, versionNonce = 1, isDeleted = false) => ({ id, version, versionNonce, isDeleted });

describe("白板合併規則（server）", () => {
  it("version 大者勝", () => {
    expect(wins(el("a", 3), el("a", 2))).toBe(true);
    expect(wins(el("a", 2), el("a", 3))).toBe(false);
  });
  it("version 相同則 versionNonce 小者勝", () => {
    expect(wins(el("a", 2, 5), el("a", 2, 9))).toBe(true);
    expect(wins(el("a", 2, 9), el("a", 2, 5))).toBe(false);
  });
  it("新元素一律接受；刪除墓碑也照版本合併", () => {
    expect(wins(el("b", 1), undefined)).toBe(true);
    expect(wins(el("a", 4, 1, true), el("a", 3))).toBe(true);
  });
});

describe("client 只送有變的元素", () => {
  it("unsynced 依已同步版本過濾", () => {
    const synced = new Map([["a", 2], ["b", 5]]);
    const out = unsynced([el("a", 2), el("b", 6), el("c", 1)], synced);
    expect(out.map((e) => e.id)).toEqual(["b", "c"]);
  });
  it("dataURL 大小換算", () => {
    const raw = "x".repeat(300);
    const url = "data:image/png;base64," + Buffer.from(raw).toString("base64");
    expect(dataUrlBytes(url)).toBe(300);
  });
});
