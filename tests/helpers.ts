import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { createSession, SESSION_COOKIE } from "@/lib/session";

/** 清空測試資料庫（只用在 cmuh_dt_test） */
export async function resetDb() {
  if (!process.env.DATABASE_URL?.includes("_test")) throw new Error("拒絕清空非測試資料庫");
  const tables = await db.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  await db.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(", ")} RESTART IDENTITY CASCADE`);
}

export const COURSE_PASS = "設計思考2026";

/** 基本 fixture：兩組各一位學員、一位講師、三個議程段落、一塊白板/組 */
export async function seedFixture() {
  await resetDb();
  const g1 = await db.group.create({ data: { name: "第一組", sortOrder: 1 } });
  const g2 = await db.group.create({ data: { name: "第二組", sortOrder: 2 } });
  const s1 = await db.user.create({ data: { name: "學員甲", role: "student", groupId: g1.id } });
  const s2 = await db.user.create({ data: { name: "學員乙", role: "student", groupId: g2.id } });
  const ins = await db.user.create({ data: { name: "講師丙", role: "instructor", passwordHash: await bcrypt.hash("pw-123456", 4) } });
  const b1 = await db.board.create({ data: { groupId: g1.id } });
  const b2 = await db.board.create({ data: { groupId: g2.id } });
  const agenda = [];
  for (const [i, title] of ["段落一", "段落二", "段落三"].entries()) {
    agenda.push(await db.agendaItem.create({ data: { title, sortOrder: i + 1 } }));
  }
  await db.appState.create({ data: { id: 1, coursePassHash: await bcrypt.hash(COURSE_PASS, 4) } });
  return { g1, g2, s1, s2, ins, b1, b2, agenda };
}

export async function cookieFor(userId: string) {
  const { token } = await createSession(userId);
  return `${SESSION_COOKIE}=${token}`;
}

export function req(path: string, init: { method?: string; body?: unknown; cookie?: string } = {}) {
  return new Request(`http://localhost:3000${path}`, {
    method: init.method ?? "GET",
    headers: { "content-type": "application/json", ...(init.cookie ? { cookie: init.cookie } : {}) },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
}

export const params = <T extends Record<string, string | string[]>>(p: T) => ({ params: Promise.resolve(p) });
