import { randomUUID } from "node:crypto";
import { unzipSync } from "fflate";
import { HttpError } from "./http";
import { putBlob } from "./blob";

export const MAX_FILE_BYTES = 50 * 1024 * 1024;
export const ALLOWED_EXT = ["pdf", "pptx", "docx", "xlsx", "png", "jpg", "jpeg", "mp4", "zip", "html"] as const;

const MIME: Record<string, string> = {
  pdf: "application/pdf",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  mp4: "video/mp4",
  zip: "application/zip",
  html: "text/html; charset=utf-8",
  htm: "text/html; charset=utf-8",
  js: "text/javascript; charset=utf-8",
  mjs: "text/javascript; charset=utf-8",
  css: "text/css; charset=utf-8",
  json: "application/json",
  svg: "image/svg+xml",
  gif: "image/gif",
  webp: "image/webp",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  woff: "font/woff",
  woff2: "font/woff2",
  ttf: "font/ttf",
  txt: "text/plain; charset=utf-8",
};

export const extOf = (name: string) => (name.split(".").pop() ?? "").toLowerCase();
export const mimeOf = (name: string) => MIME[extOf(name)] ?? "application/octet-stream";

export function checkFile(file: File, allowed: readonly string[]) {
  if (file.size <= 0) throw new HttpError(400, "檔案是空的");
  if (file.size > MAX_FILE_BYTES) throw new HttpError(400, "檔案超過 50MB");
  if (!allowed.includes(extOf(file.name))) throw new HttpError(400, `不支援的檔案類型（允許：${allowed.join("、")}）`);
}

/** 一般檔案：blob key 用 UUID，不用原始檔名 */
export async function storeFile(file: File) {
  checkFile(file, ALLOWED_EXT);
  const key = `files/${randomUUID()}`;
  await putBlob(key, new Uint8Array(await file.arrayBuffer()), mimeOf(file.name));
  return { blobKey: key, fileName: file.name, mimeType: mimeOf(file.name), size: file.size };
}

const MAX_ZIP_ENTRIES = 500;
const MAX_ZIP_TOTAL = 100 * 1024 * 1024;

/** 安全的 zip 內路徑：拒絕絕對路徑、..、反斜線 */
export function safePath(p: string) {
  if (!p || p.includes("\\") || p.startsWith("/") || p.split("/").some((s) => s === ".." || s === "")) return null;
  return p;
}

/** HTML 遊戲：單一 .html，或 .zip 內含 index.html（可在單一頂層資料夾內） */
export async function storeGame(file: File) {
  checkFile(file, ["html", "zip"]);
  const id = randomUUID();
  const prefix = `games/${id}`;
  const buf = new Uint8Array(await file.arrayBuffer());
  if (extOf(file.name) === "html") {
    await putBlob(`${prefix}/index.html`, buf, MIME.html);
    return { blobKey: prefix, fileName: file.name, mimeType: MIME.html, size: file.size };
  }
  let total = 0;
  let count = 0;
  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(buf, {
      filter: (f) => {
        count++;
        total += f.originalSize;
        if (count > MAX_ZIP_ENTRIES || total > MAX_ZIP_TOTAL) throw new HttpError(400, "zip 檔案太大或檔案太多");
        return !f.name.endsWith("/") && !f.name.startsWith("__MACOSX/");
      },
    });
  } catch (e) {
    if (e instanceof HttpError) throw e;
    throw new HttpError(400, "無法解壓縮 zip");
  }
  const names = Object.keys(entries);
  let root = "";
  if (!names.includes("index.html")) {
    const tops = new Set(names.map((n) => n.split("/")[0]));
    const only = tops.size === 1 ? [...tops][0] : null;
    if (only && names.includes(`${only}/index.html`)) root = `${only}/`;
    else throw new HttpError(400, "zip 內找不到 index.html");
  }
  for (const n of names) {
    const rel = safePath(n.slice(root.length));
    if (!rel || !n.startsWith(root)) continue;
    await putBlob(`${prefix}/${rel}`, entries[n], mimeOf(rel));
  }
  return { blobKey: prefix, fileName: file.name, mimeType: MIME.zip, size: file.size };
}
