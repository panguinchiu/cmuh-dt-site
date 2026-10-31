-- 改為個人密碼：第一次登入以課程通關密碼自行設定；不再使用組別代碼
ALTER TABLE "Group" DROP COLUMN "codeHash";
ALTER TABLE "AppState" ADD COLUMN "coursePassHash" TEXT;
-- 所有人（含講師的 seed 初始密碼）改為第一次登入自設
UPDATE "User" SET "passwordHash" = NULL;
DELETE FROM "Session";
