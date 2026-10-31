/**
 * 檔案儲存：設定 SUPABASE_URL 時用 Supabase Storage（雲端），否則用 Azure Blob（本機 Azurite）。
 * 兩者都是 private；對外只發 5 分鐘、單一物件、指定下載檔名的短效網址。
 */
import * as azure from "./blob-azure";
import * as supabase from "./blob-supabase";

const driver = () => (process.env.SUPABASE_URL ? supabase : azure);

export const putBlob = (key: string, data: Uint8Array, contentType: string) => driver().putBlob(key, data, contentType);
export const deletePrefix = (prefix: string) => driver().deletePrefix(prefix);
export const getBlob = (key: string) => driver().getBlob(key);
export const sasUrl = (key: string, fileName: string, minutes = 5) => driver().sasUrl(key, fileName, minutes);
