/**
 * Supabase Storage（雲端）。bucket 一律 private；對外只發 5 分鐘、單一物件、指定下載檔名的簽章網址。
 * 只用 REST API，金鑰（service_role／secret key）只在伺服器端。
 */
const g = globalThis as unknown as { __sbReady?: Promise<void> };

function cfg() {
  const url = process.env.SUPABASE_URL?.replace(/\/+$/, "");
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) throw new Error("缺少 SUPABASE_URL 或 SUPABASE_SERVICE_KEY");
  return { base: `${url}/storage/v1`, key, bucket: process.env.SUPABASE_BUCKET || "resources" };
}

function headers(extra: Record<string, string> = {}) {
  const { key } = cfg();
  // 新式 secret key（sb_secret_…）只能放 apikey；舊式 service_role JWT 兩者都要
  return { apikey: key, ...(key.startsWith("eyJ") ? { Authorization: `Bearer ${key}` } : {}), ...extra };
}

const enc = (key: string) => key.split("/").map(encodeURIComponent).join("/");

async function call(path: string, init: RequestInit & { headers?: Record<string, string> } = {}) {
  const { base } = cfg();
  return fetch(`${base}${path}`, { ...init, headers: headers(init.headers) });
}

async function fail(what: string, r: Response): Promise<never> {
  throw new Error(`[supabase] ${what} ${r.status} ${(await r.text()).slice(0, 200)}`);
}

/** 第一次使用時建立 private bucket（已存在則略過） */
async function ready() {
  g.__sbReady ??= (async () => {
    const { bucket } = cfg();
    const r = await call(`/bucket/${bucket}`);
    if (r.ok) return;
    const c = await call("/bucket", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: bucket, name: bucket, public: false }),
    });
    if (!c.ok && c.status !== 409) await fail("create bucket", c);
  })().catch((e) => {
    g.__sbReady = undefined;
    throw e;
  });
  await g.__sbReady;
}

export async function putBlob(key: string, data: Uint8Array, contentType: string) {
  await ready();
  const { bucket } = cfg();
  const r = await call(`/object/${bucket}/${enc(key)}`, {
    method: "POST",
    headers: { "Content-Type": contentType, "x-upsert": "true", "Cache-Control": "no-store" },
    body: data as BodyInit,
  });
  if (!r.ok) await fail("upload", r);
}

/** 列出 prefix 底下所有物件（含子資料夾） */
async function listAll(prefix: string): Promise<string[]> {
  const { bucket } = cfg();
  const out: string[] = [];
  for (let offset = 0; ; offset += 1000) {
    const r = await call(`/object/list/${bucket}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prefix, limit: 1000, offset }),
    });
    if (!r.ok) await fail("list", r);
    const items = (await r.json()) as { name: string; id: string | null }[];
    for (const it of items) {
      const full = `${prefix}/${it.name}`;
      if (it.id) out.push(full);
      else out.push(...(await listAll(full)));
    }
    if (items.length < 1000) return out;
  }
}

export async function deletePrefix(prefix: string) {
  await ready();
  const { bucket } = cfg();
  // 單一檔案的 key 本身就是物件；HTML 遊戲的 key 是資料夾
  const keys = [prefix, ...(await listAll(prefix))];
  for (let i = 0; i < keys.length; i += 500) {
    const r = await call(`/object/${bucket}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prefixes: keys.slice(i, i + 500) }),
    });
    if (!r.ok) await fail("delete", r);
  }
}

export async function getBlob(key: string) {
  const { bucket } = cfg();
  const r = await call(`/object/authenticated/${bucket}/${enc(key)}`);
  if (r.status === 404 || r.status === 400) return null;
  if (!r.ok || !r.body) await fail("download", r);
  return { stream: r.body as ReadableStream, contentType: r.headers.get("content-type") ?? undefined };
}

/** 5 分鐘、單一物件、以 download 參數指定下載檔名（Content-Disposition: attachment） */
export async function sasUrl(key: string, fileName: string, minutes = 5) {
  const { base, bucket } = cfg();
  const expiresOn = new Date(Date.now() + minutes * 60_000);
  const r = await call(`/object/sign/${bucket}/${enc(key)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ expiresIn: minutes * 60 }),
  });
  if (!r.ok) await fail("sign", r);
  const { signedURL } = (await r.json()) as { signedURL: string };
  return { url: `${base}${signedURL}&download=${encodeURIComponent(fileName)}`, expiresOn };
}
