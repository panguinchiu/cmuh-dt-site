import { userInfo } from "node:os";

// 測試一律使用獨立的測試資料庫，絕不碰開發資料
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL || `postgresql://${userInfo().username}@localhost:5432/cmuh_dt_test`;
process.env.SESSION_SECRET = "test-secret-not-for-production";
process.env.APP_ORIGIN = "http://localhost:3000";
// Azurite 公開的開發用金鑰（非機密）；SAS 產生不需要連線
process.env.AZURE_STORAGE_CONNECTION_STRING ||=
  "DefaultEndpointsProtocol=http;AccountName=devstoreaccount1;AccountKey=Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tq/K1SZFPTOtr/KBHBeksoGMGw==;BlobEndpoint=http://127.0.0.1:10000/devstoreaccount1;";
process.env.AZURE_STORAGE_CONTAINER ||= "resources-test";
