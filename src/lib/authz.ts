/**
 * 權限規則的唯一來源。所有 API route、server component、websocket 訊息都必須呼叫這裡的函式，
 * 不得在別處自行判斷。前端隱藏只是 UX。
 */
import { HttpError, forbidden, unauthorized } from "./http";

export type Role = "student" | "instructor";

export interface SessionUser {
  id: string;
  name: string;
  role: Role;
  groupId: string | null;
  title?: string | null;
}

export type Side = "med" | "surg";

export interface BoardRef {
  groupId: string;
}

export interface ResourceRef {
  visibility: "all_students" | "groups" | "users" | "instructors_only";
  groupIds: string[];
  userIds: string[];
}

export interface MatchRef {
  medGroupId: string | null;
  surgGroupId: string | null;
}

export interface GameRef {
  published: boolean;
}

export const isInstructor = (u: SessionUser | null | undefined): u is SessionUser => u?.role === "instructor";

export function requireUser(u: SessionUser | null | undefined): SessionUser {
  if (!u) throw unauthorized();
  return u;
}

export function requireInstructor(u: SessionUser | null | undefined): SessionUser {
  const user = requireUser(u);
  if (user.role !== "instructor") throw forbidden();
  return user;
}

/** 讀/寫白板、建立/還原版本、匯出：學員僅自己組，講師全部 */
export function canEditBoard(u: SessionUser | null | undefined, board: BoardRef | null | undefined): boolean {
  if (!u || !board) return false;
  if (u.role === "instructor") return true;
  return u.role === "student" && !!u.groupId && u.groupId === board.groupId;
}

export function canViewResource(u: SessionUser | null | undefined, r: ResourceRef | null | undefined): boolean {
  if (!u || !r) return false;
  if (u.role === "instructor") return true;
  if (u.role !== "student") return false;
  switch (r.visibility) {
    case "all_students":
      return true;
    case "groups":
      return !!u.groupId && r.groupIds.includes(u.groupId);
    case "users":
      return r.userIds.includes(u.id);
    case "instructors_only":
      return false;
    default:
      return false;
  }
}

/** 學員所屬席位；不在此對局回 null */
export function sideOf(u: SessionUser | null | undefined, m: MatchRef): Side | null {
  if (!u?.groupId) return null;
  if (m.medGroupId === u.groupId) return "med";
  if (m.surgGroupId === u.groupId) return "surg";
  return null;
}

/** 賽局作答：學員僅自己組所屬對局的己方席位；講師可代填/更正 */
export function canSubmitGameRound(u: SessionUser | null | undefined, m: MatchRef | null | undefined, side: Side): boolean {
  if (!u || !m) return false;
  if (u.role === "instructor") return true;
  return u.role === "student" && sideOf(u, m) === side;
}

/** 讀自己對局的分數 */
export function canViewMatch(u: SessionUser | null | undefined, m: MatchRef | null | undefined): boolean {
  if (!u || !m) return false;
  if (u.role === "instructor") return true;
  return sideOf(u, m) !== null;
}

/** 所有組的儀表板（含帶領者內容）：講師；學員僅在 published 後唯讀 */
export function canViewGameDashboard(u: SessionUser | null | undefined, g: GameRef | null | undefined): boolean {
  if (!u || !g) return false;
  if (u.role === "instructor") return true;
  return u.role === "student" && g.published === true;
}

export function assert(ok: boolean, err: HttpError = forbidden()): asserts ok {
  if (!ok) throw err;
}
