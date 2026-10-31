import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, userFromToken } from "./session";

/** server component 用 */
export async function getCurrentUser() {
  const c = await cookies();
  return userFromToken(c.get(SESSION_COOKIE)?.value);
}

export async function requirePageUser() {
  const u = await getCurrentUser();
  if (!u) redirect("/login");
  return u;
}
