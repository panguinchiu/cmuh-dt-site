import { userInfo } from "node:os";

// 測試一律使用獨立的測試資料庫，絕不碰開發資料
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL || `postgresql://${userInfo().username}@localhost:5432/cmuh_dt_test`;
process.env.SESSION_SECRET = "test-secret-not-for-production";
process.env.APP_ORIGIN = "http://localhost:3000";
// 測試只需產生 SAS 簽章（不連線），用假的金鑰即可
process.env.AZURE_STORAGE_CONNECTION_STRING ||=
  `DefaultEndpointsProtocol=http;AccountName=devstoreaccount1;AccountKey=${Buffer.from("test-only-not-a-real-key").toString("base64")};BlobEndpoint=http://127.0.0.1:10000/devstoreaccount1;`;
process.env.AZURE_STORAGE_CONTAINER ||= "resources-test";
