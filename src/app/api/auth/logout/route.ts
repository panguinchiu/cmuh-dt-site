import { json, route } from "@/lib/http";
import { clearSessionCookie, destroySession, parseCookie, SESSION_COOKIE } from "@/lib/session";

export const POST = route(async (req: Request) => {
  await destroySession(parseCookie(req.headers.get("cookie"), SESSION_COOKIE));
  return json({ ok: true }, 200, { "Set-Cookie": clearSessionCookie() });
});
