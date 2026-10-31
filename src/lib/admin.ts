import { randomBytes, randomInt } from "node:crypto";
import { Prisma } from "@prisma/client";
import { HttpError } from "./http";

export const newGroupCode = () => String(randomInt(0, 10000)).padStart(4, "0");
export const newPassword = () => randomBytes(6).toString("base64url");

/** 同名衝突（@@unique([role, name])）轉成 400 */
export function uniqueName(e: unknown): never {
  if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") throw new HttpError(400, "已有同名帳號");
  throw e;
}
