import { PrismaClient } from "@prisma/client";

// custom server 與 Next bundle 各自載入模組，用 globalThis 共用同一個連線池
const g = globalThis as unknown as { __prisma?: PrismaClient };

export const db: PrismaClient = g.__prisma ?? (g.__prisma = new PrismaClient());
