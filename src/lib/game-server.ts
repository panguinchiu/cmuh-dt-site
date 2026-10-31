import type { Prisma } from "@prisma/client";
import { db } from "./db";
import { computeMatch, normalizeRounds, verdict, type Choice } from "./game";
import { broadcast } from "./hub";
import { sideOf, type SessionUser, type Side } from "./authz";
import { notFound } from "./http";
import { DEBRIEF, LEDGER } from "./game-leader";

const matchInclude = {
  medGroup: true,
  surgGroup: true,
  rounds: { orderBy: { round: "asc" } },
} satisfies Prisma.GameMatchInclude;
type MatchRow = Prisma.GameMatchGetPayload<{ include: typeof matchInclude }>;

export async function getGame(slug: string) {
  const g = await db.game.findUnique({ where: { slug } });
  if (!g) throw notFound();
  return g;
}

export async function getMatches(gameId: string) {
  return db.gameMatch.findMany({ where: { gameId }, include: matchInclude, orderBy: [{ sortOrder: "asc" }, { label: "asc" }] });
}

const rounds = (m: MatchRow) =>
  normalizeRounds(m.rounds.map((r) => ({ round: r.round, med: r.medChoice as Choice | null, surg: r.surgChoice as Choice | null })));

const group = (g: { id: string; name: string } | null) => (g ? { id: g.id, name: g.name } : null);

/** 完整對局（講師/已公開的儀表板用） */
export function fullMatch(m: MatchRow) {
  const rs = rounds(m);
  const result = computeMatch(rs);
  return {
    id: m.id,
    label: m.label,
    med: group(m.medGroup),
    surg: group(m.surgGroup),
    rounds: rs,
    result,
    verdict: verdict(result.ratio, result.played),
  };
}

/**
 * 學員視角：只有己方對局。同時亮牌——己方還沒出牌的回合，看不到對方的選擇（只知道對方是否已出牌）。
 * 不含任何帶領者內容。
 */
export function studentMatch(m: MatchRow, side: Side) {
  const rs = rounds(m);
  const result = computeMatch(rs);
  const op: Side = side === "med" ? "surg" : "med";
  return {
    id: m.id,
    label: m.label,
    side,
    me: group(side === "med" ? m.medGroup : m.surgGroup),
    opponent: group(side === "med" ? m.surgGroup : m.medGroup),
    rounds: rs.map((r) => {
      const mine = r[side];
      const theirs = r[op];
      const revealed = !!mine && !!theirs;
      return { round: r.round, mine, theirs: revealed ? theirs : null, theirsSubmitted: !!theirs, revealed };
    }),
    rows: result.rows.map((r) => ({
      n: r.n,
      weight: r.weight,
      myPts: side === "med" ? r.medPts : r.surgPts,
      myCum: side === "med" ? r.medCum : r.surgCum,
      opCum: side === "med" ? r.surgCum : r.medCum,
    })),
    myTotal: side === "med" ? result.medTotal : result.surgTotal,
    opTotal: side === "med" ? result.surgTotal : result.medTotal,
    completed: result.completed,
    defect: result.defect,
    played: result.played,
  };
}

export async function myMatch(user: SessionUser, gameId: string) {
  const matches = await getMatches(gameId);
  for (const m of matches) {
    const side = sideOf(user, m);
    if (side) return studentMatch(m, side);
  }
  return null;
}

export async function dashboard(gameId: string, published: boolean) {
  const matches = (await getMatches(gameId)).map(fullMatch);
  return { published, matches, ledger: LEDGER, debrief: DEBRIEF };
}

export const notifyGame = (slug: string) => broadcast({ type: "game:update", slug });
export const notifyPublish = (slug: string, published: boolean) => broadcast({ type: "game:publish", slug, published });
