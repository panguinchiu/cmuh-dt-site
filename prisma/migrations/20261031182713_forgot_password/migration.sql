-- 忘記密碼申請（講師核准後清空密碼，使用者再用課程通關密碼重設）
ALTER TABLE "User" ADD COLUMN "resetRequestedAt" TIMESTAMP(3);
