import type { Prisma } from "@prisma/client";
import { db } from "./db";

export async function audit(userId: string | null, action: string, target?: string, meta?: Prisma.InputJsonValue) {
  await db.auditLog.create({ data: { userId, action, target, meta } }).catch((e) => console.error("[audit]", e));
}
