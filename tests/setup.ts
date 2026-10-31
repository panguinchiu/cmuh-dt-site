import { userInfo } from "node:os";

// 測試一律使用獨立的測試資料庫，絕不碰開發資料
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL || `postgresql://${userInfo().username}@localhost:5432/cmuh_dt_test`;
process.env.SESSION_SECRET = "test-secret-not-for-production";
process.env.APP_ORIGIN = "http://localhost:3000";
