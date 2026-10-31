/**
 * 「加護病房床位的每月抉擇」計分純函式。
 * 邏輯照 reference/nursing_game_original.html 的 computeMatch / verdict，內科取代 F、外科取代 U，數字不改。
 */
export type Choice = "FULL" | "HOLD" | "SELF";

export const CHOICES: Choice[] = ["FULL", "HOLD", "SELF"];
export const CHOICE_LABEL: Record<Choice, string> = { FULL: "全力共援", HOLD: "保留一手", SELF: "優先自保" };
export const CHOICE_DESC: Record<Choice, string> = {
  FULL: "依病情嚴重度共同調度床位，主動讓出可轉出的床位，也接受對方的病人轉入。",
  HOLD: "表面配合共同調度，私下替自家病人預留床位。若對方全力共援、你卻保留一手，短期你的收治量能會衝很高——但對方會被擠到無床可用。",
  SELF: "床位只給自家病人，不參與共同調度。當雙方都自保，轉床卡關、急診滯留、手術排程延宕，兩隊收治量能都低。",
};
export const SIDE_LABEL = { med: "內科隊", surg: "外科隊" } as const;

export const ROUNDS = 8;
export const WEIGHTS = [1, 1, 1, 2, 1, 1, 1, 3];
export const COOP_MAX = 121;
export const JOINT_MAX = 242;
export const MUTUAL_SELF = 55;

/** [內科, 外科] */
export const PAYOFF: Record<Choice, Record<Choice, [number, number]>> = {
  FULL: { FULL: [11, 11], HOLD: [2, 18], SELF: [2, 15] },
  HOLD: { FULL: [18, 2], HOLD: [8, 8], SELF: [3, 15] },
  SELF: { FULL: [15, 2], HOLD: [15, 3], SELF: [5, 5] },
};

export interface RoundInput {
  round: number; // 1..8
  med: Choice | null;
  surg: Choice | null;
}

export interface RoundRow {
  n: number;
  med: Choice | null;
  surg: Choice | null;
  weight: number;
  /** 本回合點數（未加權）；兩邊都有值才計 */
  medPts: number | null;
  surgPts: number | null;
  /** 加權累計 */
  medCum: number | null;
  surgCum: number | null;
}

export interface MatchResult {
  rows: RoundRow[];
  medTotal: number;
  surgTotal: number;
  joint: number;
  ratio: number;
  /** 首次脫離共好（非雙方全力共援）的回合 */
  defect: number | null;
  played: boolean;
  completed: number;
}

export function normalizeRounds(rounds: RoundInput[]): RoundInput[] {
  return Array.from({ length: ROUNDS }, (_, i) => {
    const r = rounds.find((x) => x.round === i + 1);
    return { round: i + 1, med: r?.med ?? null, surg: r?.surg ?? null };
  });
}

export function computeMatch(input: RoundInput[]): MatchResult {
  const rounds = normalizeRounds(input);
  let medTotal = 0;
  let surgTotal = 0;
  let defect: number | null = null;
  let completed = 0;
  const rows = rounds.map((r, i) => {
    const weight = WEIGHTS[i];
    if (r.med && r.surg) {
      const [mp, sp] = PAYOFF[r.med][r.surg];
      medTotal += mp * weight;
      surgTotal += sp * weight;
      completed++;
      if (defect === null && !(r.med === "FULL" && r.surg === "FULL")) defect = i + 1;
      return { n: i + 1, med: r.med, surg: r.surg, weight, medPts: mp, surgPts: sp, medCum: medTotal, surgCum: surgTotal };
    }
    return { n: i + 1, med: r.med, surg: r.surg, weight, medPts: null, surgPts: null, medCum: null, surgCum: null };
  });
  const joint = medTotal + surgTotal;
  return { rows, medTotal, surgTotal, joint, ratio: joint / JOINT_MAX, defect, played: completed > 0, completed };
}

export type VerdictTone = "muted" | "coop" | "accent" | "hold" | "self";

export function verdict(ratio: number, played: boolean): { text: string; tone: VerdictTone } {
  if (!played) return { text: "（尚未開始）", tone: "muted" };
  if (ratio >= 0.85) return { text: "接近全程共好", tone: "coop" };
  if (ratio >= 0.6) return { text: "多數回合合作", tone: "accent" };
  if (ratio >= 0.46) return { text: "偏向僵局", tone: "hold" };
  return { text: "信任崩壞，雙輸", tone: "self" };
}

/** 學員頁用：只回傳己方視角需要的資料（不含帶領者內容） */
export function sideView(res: MatchResult, side: "med" | "surg") {
  const my = side === "med" ? res.medTotal : res.surgTotal;
  const op = side === "med" ? res.surgTotal : res.medTotal;
  return {
    myTotal: my,
    opTotal: op,
    completed: res.completed,
    coopPct: Math.round((my / COOP_MAX) * 100),
    defect: res.defect,
    played: res.played,
  };
}
