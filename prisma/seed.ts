/**
 * npm run seed（idempotent）
 * - 所有人第一次登入時用「設計思考課程通關密碼」自行設定密碼；seed 不建立任何個人密碼
 * - 通關密碼：COURSE_PASSPHRASE，未設定則隨機產生；只在第一次設定時印在 console 一次並寫入 .seed-output.local.txt（已 gitignore）
 * - 已存在的資料不覆寫（講師在後台的修改會保留）
 */
import { randomInt } from "node:crypto";

// 本機讀 .env（不覆寫已存在的環境變數；正式環境用 App Settings，沒有 .env 也沒關係）
try {
  process.loadEnvFile(".env");
} catch {}
import { appendFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { ensureSegmentPages } from "../src/lib/boards";
import { setCoursePass } from "../src/lib/passwords";

const db = new PrismaClient();

const GROUPS: { name: string; members: (string | { name: string; title: string })[] }[] = [
  { name: "第一組", members: ["周致丞", "黃美珠", "陳巧錚", "王仰馨"] },
  { name: "第二組", members: ["林曉娟", "劉淳儀", "李及方", "王怡文"] },
  { name: "第三組", members: ["吳柏樟", "盧秀琴", "沈美均", "陳怡卉"] },
  { name: "第四組", members: ["林韋均", "楊勝彰", "陳志遠", { name: "邱德發", title: "副院長" }] },
];

const INSTRUCTORS = ["廖家德", "范硯平", "邱瓊玉", "吳宛儒"];

// 議程只有順序與標題，不存時間
const AGENDA = [
  "定義問題",
  "發想與收斂",
  "第一個未來解方",
  "從一句需求到測試站（講師：廖家德醫師）",
  "午餐＋動手發布",
  "當人人都能部署（沙盒轉向工具平台）",
  "牌桌遊戲",
  "加護病房床位的每月抉擇（賽局）",
  "黑馬來了",
  "修正原型",
  "成果發表與總結",
];

const out: string[] = [];

async function main() {
  // 組別＋白板
  const groupIds: string[] = [];
  for (const [i, g] of GROUPS.entries()) {
    let group = await db.group.findUnique({ where: { name: g.name } });
    if (!group) group = await db.group.create({ data: { name: g.name, sortOrder: i + 1 } });
    groupIds.push(group.id);
    const board = await db.board.upsert({ where: { groupId: group.id }, update: {}, create: { groupId: group.id } });
    // 各課程段落的白板版本（定義問題、發想與收斂、第一個未來解方、修正原型）
    await ensureSegmentPages(board.id);

    for (const [j, m] of g.members.entries()) {
      const name = typeof m === "string" ? m : m.name;
      const title = typeof m === "string" ? null : m.title;
      const exists = await db.user.findUnique({ where: { role_name: { role: "student", name } } });
      if (!exists) {
        await db.user.create({ data: { name, role: "student", groupId: group.id, title, sortOrder: j + 1 } });
      }
    }
  }

  // 講師（不設密碼，第一次登入自行設定）
  for (const [i, name] of INSTRUCTORS.entries()) {
    const exists = await db.user.findUnique({ where: { role_name: { role: "instructor", name } } });
    if (!exists) await db.user.create({ data: { name, role: "instructor", sortOrder: i + 1 } });
  }

  // 議程：同步成 AGENDA（同標題保留 id 並更新排序；不在清單內的舊段落刪除，不會重複新增）
  const existing = await db.agendaItem.findMany();
  const keep = new Set<string>();
  for (const [i, title] of AGENDA.entries()) {
    const hit = existing.find((e) => e.title === title && !keep.has(e.id));
    if (hit) {
      keep.add(hit.id);
      await db.agendaItem.update({ where: { id: hit.id }, data: { sortOrder: i + 1 } });
    } else {
      const created = await db.agendaItem.create({ data: { title, sortOrder: i + 1 } });
      keep.add(created.id);
    }
  }
  const stale = existing.filter((e) => !keep.has(e.id)).map((e) => e.id);
  if (stale.length) {
    await db.appState.updateMany({ where: { currentAgendaItemId: { in: stale } }, data: { currentAgendaItemId: null } });
    await db.agendaItem.deleteMany({ where: { id: { in: stale } } });
    console.log(`議程：刪除 ${stale.length} 個舊段落`);
  }
  const state = await db.appState.upsert({ where: { id: 1 }, update: {}, create: { id: 1 } });
  if (!state.coursePassHash) {
    const pass = process.env.COURSE_PASSPHRASE?.trim() || `dt${String(randomInt(0, 10000)).padStart(4, "0")}`;
    await setCoursePass(pass);
    out.push(process.env.COURSE_PASSPHRASE ? "課程通關密碼：使用 COURSE_PASSPHRASE" : `課程通關密碼：${pass}`);
  }

  // 賽局：A 對局 第一組(內科) vs 第二組(外科)；B 對局 第三組(內科) vs 第四組(外科)
  const game = await db.game.upsert({
    where: { slug: "icu-bed" },
    update: {},
    create: { slug: "icu-bed", title: "加護病房床位的每月抉擇", published: false },
  });
  if ((await db.gameMatch.count({ where: { gameId: game.id } })) === 0) {
    const pairs: [string, number, number][] = [
      ["A 對局", 0, 1],
      ["B 對局", 2, 3],
    ];
    for (const [k, [label, med, surg]] of pairs.entries()) {
      await db.gameMatch.create({
        data: {
          gameId: game.id,
          label,
          sortOrder: k + 1,
          medGroupId: groupIds[med],
          surgGroupId: groupIds[surg],
          rounds: { create: Array.from({ length: 8 }, (_, r) => ({ round: r + 1 })) },
        },
      });
    }
  }

  if (out.length) {
    const block = `\n=== seed ${new Date().toISOString()} ===\n${out.join("\n")}\n`;
    appendFileSync(".seed-output.local.txt", block);
    console.log(block);
    console.log("（以上只顯示這一次，已另存 .seed-output.local.txt，請勿 commit；講師可在管理頁改通關密碼）");
  } else {
    console.log("seed 完成：資料已存在，未產生新的通關密碼");
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
