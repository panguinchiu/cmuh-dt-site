-- 忘記密碼：email 與重設連結 token
ALTER TABLE "User" ADD COLUMN "email" TEXT,
ADD COLUMN "resetTokenHash" TEXT,
ADD COLUMN "resetTokenExpiresAt" TIMESTAMP(3);
