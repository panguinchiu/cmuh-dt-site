import bcrypt from "bcryptjs";
import { z } from "zod";
import { db } from "./db";

export const PASSWORD_MIN = 6;
export const newPassword = z.string().min(PASSWORD_MIN, `密碼至少 ${PASSWORD_MIN} 碼`).max(200);
export const coursePass = z.string().trim().min(4, "通關密碼至少 4 碼").max(100);

export const hashPassword = (pw: string) => bcrypt.hash(pw, 10);

/** 核對設計思考課程通關密碼；尚未設定時一律失敗 */
export async function checkCoursePass(input: string) {
  const s = await db.appState.findUnique({ where: { id: 1 } });
  if (!s?.coursePassHash) return false;
  return bcrypt.compare(input.trim(), s.coursePassHash);
}

export async function setCoursePass(pass: string) {
  const h = await hashPassword(pass.trim());
  await db.appState.upsert({ where: { id: 1 }, update: { coursePassHash: h }, create: { id: 1, coursePassHash: h } });
}

export const emailSchema = z.string().trim().toLowerCase().email("email 格式不正確").max(200);
