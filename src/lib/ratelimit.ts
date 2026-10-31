// 單一 instance 的記憶體 rate limit：每個 key（IP+帳號）5 分鐘內最多 5 次失敗
const WINDOW_MS = 5 * 60 * 1000;
const MAX_FAILS = 5;
const g = globalThis as unknown as { __rl?: Map<string, number[]> };
const fails: Map<string, number[]> = g.__rl ?? (g.__rl = new Map());

function recent(key: string, now = Date.now()) {
  const arr = (fails.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  if (arr.length) fails.set(key, arr);
  else fails.delete(key);
  return arr;
}

export function isLimited(key: string) {
  return recent(key).length >= MAX_FAILS;
}

export function recordFail(key: string) {
  const arr = recent(key);
  arr.push(Date.now());
  fails.set(key, arr);
}

export function clearFails(key: string) {
  fails.delete(key);
}

export function clientIp(req: Request) {
  return (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || req.headers.get("x-real-ip") || "local";
}
