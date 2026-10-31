import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Call = { url: string; method: string; headers: Record<string, string>; body?: unknown };

function mockFetch(handler: (c: Call) => Response) {
  const calls: Call[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit = {}) => {
      const c: Call = {
        url,
        method: init.method ?? "GET",
        headers: (init.headers ?? {}) as Record<string, string>,
        body: typeof init.body === "string" ? JSON.parse(init.body) : init.body,
      };
      calls.push(c);
      return handler(c);
    }),
  );
  return calls;
}

const json = (v: unknown, status = 200) => new Response(JSON.stringify(v), { status, headers: { "Content-Type": "application/json" } });

describe("Supabase Storage driver", () => {
  beforeEach(() => {
    vi.resetModules();
    (globalThis as { __sbReady?: unknown }).__sbReady = undefined;
    process.env.SUPABASE_URL = "https://proj.supabase.co/";
    process.env.SUPABASE_SERVICE_KEY = "sb_secret_test";
    process.env.SUPABASE_BUCKET = "resources-test";
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_KEY;
    delete process.env.SUPABASE_BUCKET;
  });

  it("設定 SUPABASE_URL 時改用 Supabase；下載網址為 5 分鐘簽章並指定檔名", async () => {
    const calls = mockFetch(() => json({ signedURL: "/object/sign/resources-test/files/a%20b.pdf?token=t" }));
    const { sasUrl } = await import("@/lib/blob");
    const { url, expiresOn } = await sasUrl("files/a b.pdf", "講義 1.pdf");
    expect(calls[0].url).toBe("https://proj.supabase.co/storage/v1/object/sign/resources-test/files/a%20b.pdf");
    expect(calls[0].body).toEqual({ expiresIn: 300 });
    expect(url).toBe(
      `https://proj.supabase.co/storage/v1/object/sign/resources-test/files/a%20b.pdf?token=t&download=${encodeURIComponent("講義 1.pdf")}`,
    );
    expect(expiresOn.getTime() - Date.now()).toBeLessThanOrEqual(5 * 60_000);
  });

  it("新式 secret key 只放 apikey，不放 Authorization", async () => {
    const calls = mockFetch(() => json({ signedURL: "/object/sign/x?token=t" }));
    const { sasUrl } = await import("@/lib/blob");
    await sasUrl("x", "x");
    expect(calls[0].headers.apikey).toBe("sb_secret_test");
    expect(calls[0].headers.Authorization).toBeUndefined();
  });

  it("上傳前建立 private bucket（只做一次）", async () => {
    const calls = mockFetch((c) => {
      if (c.method === "GET" && c.url.endsWith("/bucket/resources-test")) return json({ error: "not found" }, 400);
      return json({});
    });
    const { putBlob } = await import("@/lib/blob");
    await putBlob("files/a", new Uint8Array([1]), "text/plain");
    await putBlob("files/b", new Uint8Array([2]), "text/plain");
    const creates = calls.filter((c) => c.method === "POST" && c.url.endsWith("/bucket"));
    expect(creates).toHaveLength(1);
    expect(creates[0].body).toMatchObject({ id: "resources-test", public: false });
    expect(calls.filter((c) => c.url.includes("/object/resources-test/files/"))).toHaveLength(2);
  });

  it("刪除遊戲資料夾時連子資料夾的檔案一起刪", async () => {
    const calls = mockFetch((c) => {
      if (c.url.endsWith("/object/list/resources-test")) {
        const prefix = (c.body as { prefix: string }).prefix;
        if (prefix === "games/g1") return json([{ name: "index.html", id: "1" }, { name: "img", id: null }]);
        if (prefix === "games/g1/img") return json([{ name: "a.png", id: "2" }]);
      }
      return json({});
    });
    const { deletePrefix } = await import("@/lib/blob");
    await deletePrefix("games/g1");
    const del = calls.find((c) => c.method === "DELETE")!;
    expect(del.body).toEqual({ prefixes: ["games/g1", "games/g1/index.html", "games/g1/img/a.png"] });
  });

  it("找不到物件回 null", async () => {
    mockFetch(() => json({ error: "not_found" }, 400));
    const { getBlob } = await import("@/lib/blob");
    expect(await getBlob("games/none/index.html")).toBeNull();
  });
});
