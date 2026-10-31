/**
 * npm run seed（idempotent）
 * - 新建立的組別會隨機產生 4 碼代碼；新建立的講師帳號用 INSTRUCTOR_INITIAL_PASSWORD 或隨機密碼
 * - 產生的代碼/密碼只印在 console 一次，並寫入 .seed-output.local.txt（已 gitignore）
 * - 已存在的資料不覆寫（講師在後台的修改會保留）
 */
import { randomInt, randomBytes } from "node:crypto";
import { appendFileSync } from "node:fs";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

const GROUPS: { name: string; members: (string | { name: string; title: string })[] }[] = [
  { name: "第一組", members: ["周致丞", "黃美珠", "陳巧錚", "王仰馨"] },
  { name: "第二組", members: ["林曉娟", "劉淳儀", "李及方", "王怡文"] },
  { name: "第三組", members: ["吳柏樟", "盧秀琴", "沈美均", "陳怡卉"] },
  { name: "第四組", members: ["林韋均", "楊勝彰", "陳志遠", { name: "邱德發", title: "副院長" }] },
];

const INSTRUCTORS = ["廖家德", "范硯平", "邱瓊玉", "吳宛儒"];

const AGENDA: [string, string, string][] = [
  ["01", "10:00", "定義問題"],
  ["02", "10:30", "發想與收斂"],
  ["03", "11:00", "第一個未來解方"],
  ["04", "11:30", "從一句需求到測試站（講師：廖家德醫師）"],
  ["05", "12:30", "午餐＋動手發布"],
  ["06", "13:30", "當人人都能部署（沙盒轉向工具平台）"],
  ["07", "14:00", "牌桌遊戲"],
  ["08", "14:30", "加護病房床位的每月抉擇（賽局）"],
  ["09", "15:30", "教學部盃桌球策略遊戲"],
  ["10", "16:30", "黑馬來了"],
  ["11", "16:45", "修正原型"],
  ["12", "17:15", "成果發表與總結"],
];

const out: string[] = [];
const code4 = () => String(randomInt(0, 10000)).padStart(4, "0");

async function main() {
  // 組別＋白板
  const groupIds: string[] = [];
  for (const [i, g] of GROUPS.entries()) {
    let group = await db.group.findUnique({ where: { name: g.name } });
    if (!group) {
      const code = code4();
      group = await db.group.create({ data: { name: g.name, sortOrder: i + 1, codeHash: await bcrypt.hash(code, 10) } });
      out.push(`${g.name} 組別代碼：${code}`);
    }
    groupIds.push(group.id);
    await db.board.upsert({ where: { groupId: group.id }, update: {}, create: { groupId: group.id } });

    for (const [j, m] of g.members.entries()) {
      const name = typeof m === "string" ? m : m.name;
      const title = typeof m === "string" ? null : m.title;
      const exists = await db.user.findUnique({ where: { role_name: { role: "student", name } } });
      if (!exists) {
        await db.user.create({ data: { name, role: "student", groupId: group.id, title, sortOrder: j + 1 } });
      }
    }
  }

  // 講師
  const envPw = process.env.INSTRUCTOR_INITIAL_PASSWORD;
  for (const [i, name] of INSTRUCTORS.entries()) {
    const exists = await db.user.findUnique({ where: { role_name: { role: "instructor", name } } });
    if (!exists) {
      const pw = envPw || randomBytes(6).toString("base64url");
      await db.user.create({ data: { name, role: "instructor", passwordHash: await bcrypt.hash(pw, 10), sortOrder: i + 1 } });
      out.push(envPw ? `講師 ${name}：使用 INSTRUCTOR_INITIAL_PASSWORD` : `講師 ${name} 初始密碼：${pw}`);
    }
  }

  // 議程
  if ((await db.agendaItem.count()) === 0) {
    await db.agendaItem.createMany({
      data: AGENDA.map(([seq, time, title], i) => ({ seq, time, title, sortOrder: i + 1 })),
    });
  }
  await db.appState.upsert({ where: { id: 1 }, update: {}, create: { id: 1 } });

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
    console.log("（以上代碼/密碼只顯示這一次，已另存 .seed-output.local.txt，請勿 commit）");
  } else {
    console.log("seed 完成：資料已存在，未產生新代碼/密碼");
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
