-- 白板版本改為可排序的「頁」：置頂版本＝白板畫面上的版本
ALTER TABLE "Board" ADD COLUMN "activeVersionId" TEXT;
ALTER TABLE "BoardVersion" ADD COLUMN "sortOrder" INTEGER NOT NULL DEFAULT 0;
DROP INDEX "BoardVersion_boardId_createdAt_idx";
CREATE INDEX "BoardVersion_boardId_sortOrder_idx" ON "BoardVersion"("boardId", "sortOrder");
-- 既有版本依建立時間（新到舊）排在後面
UPDATE "BoardVersion" v SET "sortOrder" = sub.rn FROM (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY "boardId" ORDER BY "createdAt" DESC) + 100 AS rn FROM "BoardVersion"
) sub WHERE v.id = sub.id;
