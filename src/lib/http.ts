import { ZodError } from "zod";

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export const unauthorized = () => new HttpError(401, "請先登入");
export const forbidden = () => new HttpError(403, "沒有權限");
export const notFound = () => new HttpError(404, "找不到");

export function json(data: unknown, status = 200, headers?: HeadersInit) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store", ...headers } });
}

/** route handler 包裝：HttpError/ZodError 轉成 JSON，其他錯誤 500 且不洩漏細節 */
export function route<A extends unknown[]>(fn: (...args: A) => Promise<Response>) {
  return async (...args: A): Promise<Response> => {
    try {
      return await fn(...args);
    } catch (e) {
      if (e instanceof HttpError) return json({ error: e.message }, e.status);
      if (e instanceof ZodError) return json({ error: "輸入格式不正確", issues: e.issues }, 400);
      console.error("[route error]", e);
      return json({ error: "伺服器錯誤" }, 500);
    }
  };
}
