-- 議程不存時間：移除 seq 與 time 欄位（順序由 sortOrder 決定）
ALTER TABLE "AgendaItem" DROP COLUMN "seq",
DROP COLUMN "time";
