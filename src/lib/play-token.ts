/**
 * HTML 遊戲的短效簽章路徑：/play/<resourceId>/<token>/<path>
 * 遊戲在 sandbox iframe（opaque origin）內執行，子資源請求不會帶 session cookie，
 * 所以用路徑上的 HMAC token 授權；伺服器每次請求仍重驗使用者與可見範圍。
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "./env";

const TTL_MS = 3 * 60 * 60 * 1000;

const sign = (s: string) => createHmac("sha256", env.sessionSecret).update(`play:${s}`).digest("base64url");

export function makePlayToken(resourceId: string, userId: string, now = Date.now()) {
  const payload = Buffer.from(JSON.stringify({ r: resourceId, u: userId, e: now + TTL_MS })).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function readPlayToken(token: string, resourceId: string, now = Date.now()): { userId: string } | null {
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  const expect = Buffer.from(sign(payload));
  const got = Buffer.from(sig);
  if (expect.length !== got.length || !timingSafeEqual(expect, got)) return null;
  try {
    const d = JSON.parse(Buffer.from(payload, "base64url").toString());
    if (d.r !== resourceId || typeof d.u !== "string" || typeof d.e !== "number" || d.e < now) return null;
    return { userId: d.u };
  } catch {
    return null;
  }
}

export function playUrl(resourceId: string, userId: string) {
  const base = env.gameOrigin || "";
  return `${base}/play/${resourceId}/${makePlayToken(resourceId, userId)}/index.html`;
}

/** 遊戲回應 header：CSP sandbox（無 allow-same-origin）、禁止連線、只允許主站嵌入 */
export function gameHeaders(contentType: string) {
  return {
    "Content-Type": contentType,
    "Content-Security-Policy": `sandbox allow-scripts; default-src 'self' 'unsafe-inline' data: blob:; connect-src 'none'; frame-ancestors 'self' ${env.appOrigin}`,
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "Cross-Origin-Resource-Policy": "same-site",
    "Cache-Control": "private, max-age=300",
  };
}
